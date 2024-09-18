const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatMessages = document.getElementById("chat-messages");
const closeBtn = document.getElementById("close-btn");
const loadingIndicator = document.getElementById("loading-indicator");

const addMessage = (content, isUser = false) => {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user-message" : "bot-message"}`;
  messageDiv.textContent = content;

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const question = userInput.value.trim();
  if (question) {
    addMessage(question, true);
    window.parent.postMessage({ type: "ASK_QUESTION", question }, "*");
    userInput.value = "";
    userInput.style.height = "auto";
  }
});

closeBtn.addEventListener("click", () => {
  window.parent.postMessage({ type: "CLOSE_CHATBOT" }, "*");
});

window.addEventListener("message", (event) => {
  if (event.data.type === "CHATBOT_RESPONSE") {
    addMessage(event.data.answer);
  } else if (event.data.type === "CHATBOT_ERROR") {
    addMessage(`Error: ${event.data.error}`);
  } else if (event.data.type === "CHATBOT_LOADING") {
    loadingIndicator.classList.toggle("hidden", !event.data.loading);
  }
});

// Function to auto-expand textarea
const autoExpand = (field) => {
  field.style.height = "inherit";
  const computed = window.getComputedStyle(field);
  const height =
    parseInt(computed.getPropertyValue("border-top-width"), 10) +
    parseInt(computed.getPropertyValue("padding-top"), 10) +
    field.scrollHeight +
    parseInt(computed.getPropertyValue("padding-bottom"), 10) +
    parseInt(computed.getPropertyValue("border-bottom-width"), 10);

  field.style.height = `${height}px`;
};

userInput.addEventListener("input", () => autoExpand(userInput));
