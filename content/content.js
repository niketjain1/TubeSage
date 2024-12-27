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

  const toggleChatboxButton = (show, message = "") => {
    const toggleButton = document.getElementById("yt-chatbot-toggle");
    if (toggleButton) {
      if (show) {
        toggleButton.style.display = "flex";
        toggleButton.title = "Toggle youtube chatbot";
      } else {
        toggleButton.style.display = "none";
        if (message) {
          toggleButton.style.display = "flex";
          toggleButton.style.opacity = "0.5";
          toggleButton.style.cursor = "not-allowed";
          toggleButton.title = message;
          toggleButton.disabled = true;
        }
      }
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
      const maxAttempts = 10;
      let attempts = 0;
      let transcriptOpened = false;

      const cleanup = () => {
        const closeTranscriptButton = document.querySelector(
          'button[aria-label="Close transcript"]'
        );
        if (closeTranscriptButton && transcriptOpened) {
          closeTranscriptButton.click();
        }
      };

      const tryOpenTranscript = () => {
        // Cleanup any existing open transcript first
        cleanup();

        const menuButton = document.querySelector('button[aria-label="More actions"]');
        if (!menuButton) {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(tryOpenTranscript, 2000);
          } else {
            cleanup();
            reject(new Error("Menu button not found after multiple attempts"));
          }
          return;
        }

        const openTranscriptButton = document.querySelector(
          'button[aria-label="Show transcript"]'
        );
        
        if (!openTranscriptButton) {
          cleanup();
          reject(new Error("No transcript available for this video"));
          return;
        }

        openTranscriptButton.click();
        transcriptOpened = true;

        setTimeout(() => {
          const transcriptText = extractTranscriptText();
          if (transcriptText) {
            cleanup();
            transcriptOpened = false;
            resolve(transcriptText);
          } else {
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(tryOpenTranscript, 2000);
            } else {
              cleanup();
              reject(new Error("No transcript found after multiple attempts"));
            }
          }
        }, 1000);
      };

      // Add cleanup on page unload
      window.addEventListener('beforeunload', cleanup);

      setTimeout(tryOpenTranscript, 3000);
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

  const getVideoMetadata = () => {
    const metadata = {
      title: document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim() || '',
      channel: document.querySelector('ytd-video-owner-renderer #channel-name')?.textContent?.trim() || '',
      description: document.querySelector('ytd-expander#description')?.textContent?.trim() || '',
      views: document.querySelector('ytd-video-view-count-renderer')?.textContent?.trim() || '',
      date: document.querySelector('.ytd-video-primary-info-renderer .ytd-video-primary-info-renderer:last-child')?.textContent?.trim() || ''
    };
    return metadata;
  };

  const generateSuggestedQuestions = async () => {
    if (!transcript) {
      showError("No transcript available. Suggested questions cannot be generated.");
      return;
    }

    try {
      const metadata = getVideoMetadata();
      const data = await handleOpenAIRequest(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a youtube video analysis assistant. Generate 3-5 short, precise, and specific questions based on the video content. Each question should be no longer than 10 words and should encourage viewers to engage more deeply with the video content. Consider the video's title, channel style, and topic when generating questions. The questions should only be in english. Don't include the keyword 'transcript' in your response.",
            },
            {
              role: "user",
              content: `Video Context:
Title: ${metadata.title}
Channel: ${metadata.channel}
Description: ${metadata.description}
Views: ${metadata.views}
Upload Date: ${metadata.date}

Transcript: ${transcript}

Task: Generate 3-5 suggested questions about this video content that match the channel's style and topic.`,
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
      showError("No transcript available. Cannot perform the requested action.");
      return;
    }

    const metadata = getVideoMetadata();
    const actionPrompts = {
      summarize:
        "Provide a brief summary of the video content in about 3-4 sentences, matching the tone and style of the channel. Don't include the keyword 'transcript' in your response.",
      "key-points":
        "List the 3-5 main key points or takeaways from the video, considering the channel's style and target audience. Don't include the keyword 'transcript' in your response.",
      explain:
        "Provide a detailed explanation of the main topic discussed in the video, matching the creator's communication style. Don't include the keyword 'transcript' in your response.",
      "related-topics":
        "Suggest 3-5 related topics that viewers of this channel might want to explore further based on this video's content. Don't include the keyword 'transcript' in your response.",
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
                "You are a youtube video analysis assistant. Provide concise and informative responses based on the video content. Match the tone and style of the channel. Don't include the keyword 'transcript' in your response.",
            },
            {
              role: "user",
              content: `Video Context:
Title: ${metadata.title}
Channel: ${metadata.channel}
Description: ${metadata.description}
Views: ${metadata.views}
Upload Date: ${metadata.date}

Transcript: ${transcript}

Task: ${actionPrompts[action]}`,
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
      const metadata = getVideoMetadata();

      const data = await handleOpenAIRequest(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a youtube video assistant that answers questions based on the provided video content. Keep answers concise and match the tone of the channel. Don't mention the keyword 'transcript'. If the question is not related to the video, respond with 'I'm sorry, I can't answer that question. It's not related to this video's content.'",
            },
            {
              role: "user",
              content: `Video Context:
Title: ${metadata.title}
Channel: ${metadata.channel}
Description: ${metadata.description}
Views: ${metadata.views}
Upload Date: ${metadata.date}

Transcript: ${transcript}`,
            },
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
      const newVideoId = getVideoId(window.location.href);
      
      // Only fetch transcript if it's a different video
      if (newVideoId !== currentVideoId) {
        currentVideoId = newVideoId;
        try {
          transcript = await fetchTranscript();
          toggleChatboxButton(true);
        } catch (error) {
          console.error("Error fetching transcript:", error);
          toggleChatboxButton(false, "Chat unavailable - No transcript found for this video");
          container.classList.remove("yt-chatbot-open");
          container.classList.add("yt-chatbot-closed");
        }
      }
      container.classList.remove("yt-chatbot-closed");
      suggestedQuestionsGenerated = false;
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
