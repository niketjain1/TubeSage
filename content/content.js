(function () {
  // Check if the script has already run
  if (window.hasRun) {
    return;
  }
  window.hasRun = true;

  let chatHistory = [];
  let currentVideoId = null;
  let lastUrl = location.href;
  let transcript = null;
  let isWaitingForResponse = false;
  let apiKey = null;
  let suggestedQuestionsGenerated = false;

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes.encryptedApiKey) {
      onPageLoad();
    }
  });

  const showError = (message) => {
    const iframe = document.getElementById("yt-chatbot-iframe");
    iframe.contentWindow.postMessage(
      { type: "SHOW_ERROR", message: message },
      "*"
    );
  };

  const isVideoPage = () => {
    return window.location.pathname === "/watch";
  };

  const getVideoId = (url) => {
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get("v");
  };

  const toggleChatboxButton = (show) => {
    const toggleButton = document.getElementById("yt-chatbot-toggle");
    if (toggleButton) {
      toggleButton.style.display = show ? "flex" : "none";
    }
  };

  const getApiKey = async () => {
    try {
      const result = await chrome.storage.local.get(["encryptedApiKey"]);
      if (!result.encryptedApiKey) {
        throw new Error("API key not found in storage");
      }
      const response = await chrome.runtime.sendMessage({
        action: "getApiKey",
      });
      if (!response || !response.apiKey) {
        throw new Error("Failed to retrieve API key");
      }
      return response.apiKey;
    } catch (error) {
      showError(
        `API Key Error: ${error.message}. Please set your OpenAI API Key in the extension options.`
      );
      return null;
    }
  };

  const extractTranscriptText = () => {
    const transcriptItems = document.querySelectorAll(
      "ytd-transcript-segment-renderer"
    );
    let transcriptText = "";

    transcriptItems.forEach((item) => {
      const text = item.innerText.trim();
      const cleanedText = text.replace(/^\d{1,2}:\d{2}(:\d{2})?\s*/, "").trim();
      transcriptText += cleanedText.replace(/\n+/g, " ").trim() + "\n";
    });

    return transcriptText.trim();
  };

  const injectChatbot = () => {
    const container = document.createElement("div");
    container.id = "yt-chatbot-container";
    container.className = "yt-chatbot-closed";

    const iframe = document.createElement("iframe");
    iframe.id = "yt-chatbot-iframe";
    iframe.src = chrome.runtime.getURL("chatbot.html");

    container.appendChild(iframe);
    document.body.appendChild(container);

    const toggleButton = document.createElement("button");
    toggleButton.id = "yt-chatbot-toggle";
    toggleButton.innerHTML = "💬";
    toggleButton.title = "Toggle youtube chatbot";
    document.body.appendChild(toggleButton);

    toggleButton.addEventListener("click", () => {
      container.classList.toggle("yt-chatbot-closed");
      container.classList.toggle("yt-chatbot-open");
      if (!suggestedQuestionsGenerated) {
        generateSuggestedQuestions(apiKey);
        suggestedQuestionsGenerated = true;
      }
    });

    // Initially hide the button, it will be shown if it's a video page
    toggleButton.style.display = "none";
  };

  const fetchTranscript = () => {
    return new Promise((resolve, reject) => {
      const maxAttempts = 5;
      let attempts = 0;

      const tryOpenTranscript = () => {
        const openTranscriptButton = document.querySelector(
          'button[aria-label="Show transcript"]'
        );
        const closeTranscriptButton = document.querySelector(
          'button[aria-label="Close transcript"]'
        );

        if (openTranscriptButton) {
          openTranscriptButton.click();
          setTimeout(() => {
            const transcriptText = extractTranscriptText();
            if (transcriptText) {
              resolve(transcriptText);
            } else {
              reject(new Error("No transcript found"));
            }
            if (closeTranscriptButton) closeTranscriptButton.click();
          }, 1000);
        } else {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(tryOpenTranscript, 2000);
          } else {
            reject(
              new Error(
                "Could not find transcript button after multiple attempts"
              )
            );
          }
        }
      };

      setTimeout(tryOpenTranscript, 2000);
    });
  };

  const handleOpenAIRequest = async (endpoint, body) => {
    if (!apiKey) {
      throw new Error("No API key available");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.error) {
      showError(
        "Invalid API key. Please check your OpenAI API key and try again."
      );
    }
    return data;
  };

  const generateSuggestedQuestions = async () => {
    if (!transcript) {
      showError(
        "No transcript available. Suggested questions cannot be generated."
      );
      return;
    }

    try {
      const data = await handleOpenAIRequest(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a youtube video analysis assistant. Generate 3-5 short, precise, and specific questions based on the video transcript. Each question should be no longer than 10 words and should encourage viewers to engage more deeply with the video content. The questions should only be in english.",
            },
            {
              role: "user",
              content: `Transcript: ${transcript}\n\nTask: Generate 3-5 suggested questions about this video content.`,
            },
          ],
        }
      );

      const questions = data.choices[0].message.content
        .split("\n")
        .filter((q) => q.trim());

      if (questions.length > 0) {
        const iframe = document.getElementById("yt-chatbot-iframe");
        iframe.contentWindow.postMessage(
          { type: "SUGGESTED_QUESTIONS", questions: questions },
          "*"
        );
      }
    } catch (error) {
      showError(`Error generating suggested questions: ${error.message}`);
    }
  };

  const handleActionButton = async (action) => {
    if (!transcript) {
      showError(
        "No transcript available. Cannot perform the requested action."
      );
      return;
    }

    const actionPrompts = {
      summarize:
        "Provide a brief summary of the video content in about 3-4 sentences.",
      "key-points": "List the 3-5 main key points or takeaways from the video.",
      explain:
        "Provide a detailed explanation of the main topic discussed in the video.",
      "related-topics":
        "Suggest 3-5 related topics that viewers might want to explore further based on this video's content.",
    };

    try {
      const data = await handleOpenAIRequest(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a youtube video analysis assistant. Provide concise and informative responses based on the video transcript.",
            },
            {
              role: "user",
              content: `Transcript: ${transcript}\n\nTask: ${actionPrompts[action]}`,
            },
          ],
        }
      );

      if (!data.error) {
        const result = data.choices[0].message.content;
        const iframe = document.getElementById("yt-chatbot-iframe");
        iframe.contentWindow.postMessage(
          { type: "CHATBOT_RESPONSE", answer: result },
          "*"
        );
      }
    } catch (error) {
      showError(`Error: ${error.message}`);
    }
  };

  const askQuestion = async (question) => {
    if (!transcript) {
      showError("No transcript available. Cannot answer questions.");
      return;
    }

    try {
      isWaitingForResponse = true;

      const data = await handleOpenAIRequest(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a youtube question answerer assistant that answers questions based on the provided video transcript. Keep the answer short and concise in english. Don't mention the keyword 'transcript' while answering the question. The answer should be in third person in respective of the person in the video. If the question is not related to the video, say respond with 'I'm sorry, I can't answer that question. Its out of context.'",
            },
            { role: "user", content: `Transcript: ${transcript}` },
            ...chatHistory,
            { role: "user", content: question },
          ],
        }
      );

      if (!data.error) {
        const answer = data.choices[0].message.content;

        chatHistory.push({ role: "user", content: question });
        chatHistory.push({ role: "assistant", content: answer });

        return answer;
      }
    } finally {
      isWaitingForResponse = false;
    }
  };

  const clearChatMessages = () => {
    const iframe = document.getElementById("yt-chatbot-iframe");
    iframe.contentWindow.postMessage({ type: "CLEAR_CHAT" }, "*");
  };

  const onPageLoad = async () => {
    const isVideo = isVideoPage();
    toggleChatboxButton(isVideo);

    const container = document.getElementById("yt-chatbot-container");
    apiKey = await getApiKey();

    if (isVideo) {
      currentVideoId = getVideoId(window.location.href);
      try {
        transcript = await fetchTranscript();
      } catch (error) {
        console.error("Error fetching transcript:", error);
      }
      container.classList.remove("yt-chatbot-closed");
    } else {
      currentVideoId = null;
      transcript = null;
      container.classList.remove("yt-chatbot-open");
      container.classList.add("yt-chatbot-closed");
    }

    chatHistory = [];
    clearChatMessages();
  };

  injectChatbot();

  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      onPageLoad();
    }
  }).observe(document, { subtree: true, childList: true });

  onPageLoad();

  window.addEventListener("message", async (event) => {
    if (event.data.type === "ASK_QUESTION") {
      try {
        const answer = await askQuestion(event.data.question, apiKey);
        if (answer) {
          event.source.postMessage(
            { type: "CHATBOT_RESPONSE", answer: answer },
            "*"
          );
        }
      } catch (error) {
        showError(`Error: ${error.message}`);
      } finally {
        event.source.postMessage(
          { type: "CHATBOT_LOADING", loading: false },
          "*"
        );
      }
    } else if (event.data.type === "ACTION_BUTTON") {
      event.source.postMessage({ type: "CHATBOT_LOADING", loading: true }, "*");
      handleActionButton(event.data.action, apiKey);
    } else if (event.data.type === "CLOSE_CHATBOT") {
      document
        .getElementById("yt-chatbot-container")
        .classList.remove("yt-chatbot-open");
      document
        .getElementById("yt-chatbot-container")
        .classList.add("yt-chatbot-closed");
    }
  });
})();
