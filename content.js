// Function to inject the chatbot UI
function injectChatbot() {
  const container = document.createElement("div");
  container.id = "yt-chatbot-container";

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
    container.classList.toggle("open");
  });
}

// Function to extract video ID from URL
function getVideoId(url) {
  const urlParams = new URLSearchParams(new URL(url).search);
  return urlParams.get("v");
}

// Function to get video transcript
async function getTranscript(videoId) {
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
      throw new Error("Failed to fetch transcript");
    }
    const data = await response.json();
    return data.transcript;
  } catch (error) {
    console.error("Error fetching transcript:", error);
    return null;
  }
}

// Inject chatbot when the page loads
injectChatbot();

// Listen for messages from the iframe
window.addEventListener("message", async (event) => {
  if (event.data.type === "ASK_QUESTION") {
    const videoId = getVideoId(window.location.href);
    const transcript = await getTranscript(videoId);

    if (!transcript) {
      event.source.postMessage(
        {
          type: "CHATBOT_ERROR",
          error: "Transcript not available for this video.",
        },
        "*"
      );
      return;
    }

    try {
      const response = await fetch("http://localhost:8000/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          question: event.data.question,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get answer from server");
      }

      const data = await response.json();
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
    }
  } else if (event.data.type === "CLOSE_CHATBOT") {
    document.getElementById("yt-chatbot-container").classList.remove("open");
  }
});
