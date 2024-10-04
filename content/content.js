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

  const getApiKey = () => {
    return new Promise((resolve) => {
      chrome.storage.local.get(["encryptedApiKey"], (result) => {
        if (result.encryptedApiKey) {
          chrome.runtime.sendMessage({ action: "getApiKey" }, (response) => {
            if (response && response.apiKey) {
              resolve(response.apiKey);
            } else {
              console.error("Failed to retrieve API key");
              resolve(null);
            }
          });
        } else {
          console.error("No API key found in storage");
          resolve(null);
        }
      });
    });
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
    toggleButton.title = "Toggle Q&A Chatbot";
    document.body.appendChild(toggleButton);

    toggleButton.addEventListener("click", () => {
      container.classList.toggle("yt-chatbot-closed");
      container.classList.toggle("yt-chatbot-open");
    });

    // Initially hide the button, it will be shown if it's a video page
    toggleButton.style.display = "none";
  };

  const fetchTranscript = () => {
    return new Promise((resolve, reject) => {
      const maxAttempts = 5;
      let attempts = 0;

      const tryOpenTranscript = () => {
        const opeTranscriptButton = document.querySelector(
          'button[aria-label="Show transcript"]'
        );

        const closeTranscriptButton = document.querySelector(
          'button[aria-label="Close transcript"]'
        );

        if (opeTranscriptButton) {
          opeTranscriptButton.click();
          setTimeout(() => {
            const transcriptText = extractTranscriptText();
            //   console.log({ transcriptText });
            if (transcriptText) {
              resolve(transcriptText);
              closeTranscriptButton.click();
            } else {
              reject("No transcript found");
              closeTranscriptButton.click();
            }
          }, 4000);
        } else {
          attempts++;
          if (attempts < maxAttempts) {
            console.log(
              `Attempt ${attempts}: Transcript button not found. Retrying...`
            );
            setTimeout(tryOpenTranscript, 2000);
          } else {
            reject("Could not find transcript button after multiple attempts");
          }
        }
      };

      setTimeout(tryOpenTranscript, 2000);
    });
  };

  const generateSuggestedQuestions = async () => {
    if (!transcript) return;

    const apiKey = await getApiKey();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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
      }),
    });

    const data = await response.json();
    const questions = data.choices[0].message.content
      .split("\n")
      .filter((q) => q.trim());

    const iframe = document.getElementById("yt-chatbot-iframe");
    iframe.contentWindow.postMessage(
      { type: "SUGGESTED_QUESTIONS", questions: questions },
      "*"
    );
  };

  const handleActionButton = async (action) => {
    if (!transcript) return;
    const apiKey = await getApiKey();

    const actionPrompts = {
      summarize:
        "Provide a brief summary of the video content in about 3-4 sentences.",
      "key-points": "List the 3-5 main key points or takeaways from the video.",
      explain:
        "Provide a detailed explanation of the main topic discussed in the video.",
      "related-topics":
        "Suggest 3-5 related topics that viewers might want to explore further based on this video's content.",
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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
      }),
    });

    const data = await response.json();
    const result = data.choices[0].message.content;

    const iframe = document.getElementById("yt-chatbot-iframe");
    iframe.contentWindow.postMessage(
      { type: "CHATBOT_RESPONSE", answer: result },
      "*"
    );
  };

  const askQuestion = async (question) => {
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error(
        "No API key available. Please set your OpenAI API Key in the extension options."
      );
    }

    try {
      isWaitingForResponse = true;

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a youtube question answerer assitant that answers questions based on the provided video transcript. Keep the answer short and concise in english. Don't mention the keyword 'transcript' while answering the question. The answer should be in third person in respective of the person in the video. If the question is not related to the video, say respond with 'I'm sorry, I can't answer that question. Its out of context.'",
              },
              { role: "user", content: `Transcript: ${transcript}` },
              ...chatHistory,
              { role: "user", content: question },
            ],
          }),
        }
      );

      console.log({ response });
      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 401) {
          alert(
            "Invalid API key. Please check your OpenAI API key and try again."
          );
        } else {
          alert(`OpenAI API error: ${errorData.error.message}`);
        }
        isWaitingForResponse = false;
        return;
      }

      const data = await response.json();
      const answer = data.choices[0].message.content;

      chatHistory.push({ role: "user", content: question });
      chatHistory.push({ role: "assistant", content: answer });

      return answer;
    } catch (error) {
      console.error("Error getting answer:", error);
      throw error;
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

    if (isVideo) {
      currentVideoId = getVideoId(window.location.href);
      try {
        transcript = await fetchTranscript();
        await generateSuggestedQuestions();
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
        const answer = await askQuestion(event.data.question);
        event.source.postMessage(
          { type: "CHATBOT_RESPONSE", answer: answer },
          "*"
        );
      } catch (error) {
        event.source.postMessage(
          {
            type: "CHATBOT_ERROR",
            error: error.message,
          },
          "*"
        );
      } finally {
        event.source.postMessage(
          { type: "CHATBOT_LOADING", loading: false },
          "*"
        );
      }
    } else if (event.data.type === "ACTION_BUTTON") {
      handleActionButton(event.data.action);
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
