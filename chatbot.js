const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatMessages = document.getElementById("chat-messages");
const closeBtn = document.getElementById("close-btn");

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
  }
});
