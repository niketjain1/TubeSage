let chatHistory = [];

// Function to inject the chatbot UI
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
};

// Function to extract video ID from URL
const getVideoId = (url) => {
  const urlParams = new URLSearchParams(new URL(url).search);
  return urlParams.get("v");
};

// Function to fetch transcript (only called once when video loads)
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

injectChatbot();

let currentVideoId = getVideoId(window.location.href);

fetchTranscript(currentVideoId).then(() => {
  document
    .getElementById("yt-chatbot-container")
    .classList.remove("yt-chatbot-closed");
  document
    .getElementById("yt-chatbot-container")
    .classList.add("yt-chatbot-open");
});

let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    currentVideoId = getVideoId(url);
    fetchTranscript(currentVideoId).then(() => {
      document
        .getElementById("yt-chatbot-container")
        .classList.remove("yt-chatbot-closed");
      document
        .getElementById("yt-chatbot-container")
        .classList.add("yt-chatbot-open");
    });
    chatHistory = [];
  }
}).observe(document, { subtree: true, childList: true });

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
  } else if (event.data.type === "CLOSE_CHATBOT") {
    document
      .getElementById("yt-chatbot-container")
      .classList.remove("yt-chatbot-open");
    document
      .getElementById("yt-chatbot-container")
      .classList.add("yt-chatbot-closed");
  }
});
