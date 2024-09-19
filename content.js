let chatHistory = [];
let currentVideoId = null;
let lastUrl = location.href;

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

const fetchTranscript = async (videoId) => {
  try {
    const response = await fetch(`http://localhost:8000/transcript`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
      }),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch video context");
    }
    const data = await response.json();
    return data.transcript;
  } catch (error) {
    console.error("Error fetching transcript:", error);
    return null;
  }
};

const generateSuggestedQuestions = async () => {
  try {
    const response = await fetch("http://localhost:8000/suggested_questions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${currentVideoId}`,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to generate suggested questions");
    }

    const data = await response.json();
    const iframe = document.getElementById("yt-chatbot-iframe");
    iframe.contentWindow.postMessage(
      { type: "SUGGESTED_QUESTIONS", questions: data.questions },
      "*"
    );
  } catch (error) {
    console.error("Error generating suggested questions:", error);
  }
};

const handleActionButton = async (action) => {
  try {
    const response = await fetch("http://localhost:8000/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${currentVideoId}`,
        action: action,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to perform action");
    }

    const data = await response.json();
    const iframe = document.getElementById("yt-chatbot-iframe");
    iframe.contentWindow.postMessage(
      { type: "CHATBOT_RESPONSE", answer: data.result },
      "*"
    );
  } catch (error) {
    console.error("Error performing action:", error);
    const iframe = document.getElementById("yt-chatbot-iframe");
    iframe.contentWindow.postMessage(
      {
        type: "CHATBOT_ERROR",
        error: "Failed to perform action. Please try again.",
      },
      "*"
    );
  }
};

const clearChatMessages = () => {
  const iframe = document.getElementById("yt-chatbot-iframe");
  iframe.contentWindow.postMessage({ type: "CLEAR_CHAT" }, "*");
};

const onPageLoad = () => {
  const isVideo = isVideoPage();
  toggleChatboxButton(isVideo);

  const container = document.getElementById("yt-chatbot-container");

  if (isVideo) {
    currentVideoId = getVideoId(window.location.href);
    fetchTranscript(currentVideoId).then(() => {
      generateSuggestedQuestions();
    });
    container.classList.remove("yt-chatbot-closed");
  } else {
    currentVideoId = null;
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
      event.source.postMessage({ type: "CHATBOT_LOADING", loading: true }, "*");
      const response = await fetch("http://localhost:8000/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${currentVideoId}`,
          question: event.data.question,
          chat_history: chatHistory,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get answer from server");
      }

      const data = await response.json();
      chatHistory = data.updated_history;
      event.source.postMessage(
        { type: "CHATBOT_RESPONSE", answer: data.answer },
        "*"
      );
    } catch (error) {
      console.error("Error getting answer:", error);
      event.source.postMessage(
        {
          type: "CHATBOT_ERROR",
          error: "Failed to get answer. Please try again.",
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
