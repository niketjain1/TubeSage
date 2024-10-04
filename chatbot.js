const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatMessages = document.getElementById("chat-messages");
const closeBtn = document.getElementById("close-btn");
const loadingIndicator = document.getElementById("loading-indicator");
const actionDropdownBtn = document.getElementById("action-dropdown-btn");
const actionDropdownContent = document.getElementById(
  "action-dropdown-content"
);
const suggestedQuestionsContainer = document.getElementById(
  "suggested-questions"
);
const sendBtn = document.getElementById("send-btn");
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const apiKeyInput = document.getElementById("api-key-input");
const saveApiKeyBtn = document.getElementById("save-api-key");
const closeModalBtn = document.getElementById("close-modal");

settingsBtn.addEventListener("click", () => {
  settingsModal.style.display = "block";
  chrome.storage.local.get(["encryptedApiKey"], (result) => {
    if (result.encryptedApiKey) {
      apiKeyInput.value = "********";
    }
  });
});

closeModalBtn.addEventListener("click", () => {
  settingsModal.style.display = "none";
});

saveApiKeyBtn.addEventListener("click", () => {
  const newApiKey = apiKeyInput.value;
  if (newApiKey && newApiKey !== "********") {
    chrome.runtime.sendMessage(
      { action: "encryptAndStoreApiKey", apiKey: newApiKey },
      (response) => {
        if (response && response.success) {
          alert("API Key saved successfully!");
          settingsModal.style.display = "none";
        } else {
          alert("Error saving API Key. Please try again.");
        }
      }
    );
  } else {
    alert("Please enter a valid API Key.");
  }
});

window.addEventListener("click", (event) => {
  if (event.target === settingsModal) {
    settingsModal.style.display = "none";
  }
});

const addMessage = (content, isUser = false) => {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user-message" : "bot-message"}`;

  const textSpan = document.createElement("span");
  textSpan.textContent = content;
  messageDiv.appendChild(textSpan);

  chatMessages.appendChild(messageDiv);

  if (isUser) {
    const loaderDiv = document.createElement("div");
    loaderDiv.className = "message bot-message loader";
    loaderDiv.innerHTML =
      '<div class="loading-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
    chatMessages.appendChild(loaderDiv);
  }

  chatMessages.scrollTop = chatMessages.scrollHeight;
};

const removeLoader = () => {
  const loader = chatMessages.querySelector(".loader");
  if (loader) {
    loader.remove();
  }
};

const addSuggestedQuestions = (questions) => {
  suggestedQuestionsContainer.innerHTML = "";
  questions.forEach((question) => {
    const questionBtn = document.createElement("button");
    questionBtn.className = "suggested-question";
    const questionWithoutNumber = question.replace(/^\d+\.\s*/, "").trim();
    questionBtn.textContent = questionWithoutNumber;
    questionBtn.addEventListener("click", () => {
      addMessage(questionWithoutNumber, true);
      window.parent.postMessage(
        { type: "ASK_QUESTION", question: questionWithoutNumber },
        "*"
      );
    });
    suggestedQuestionsContainer.appendChild(questionBtn);
  });
};

const handleSubmit = (e) => {
  e.preventDefault();
  const question = userInput.value.trim();
  if (question) {
    addMessage(question, true);
    window.parent.postMessage({ type: "ASK_QUESTION", question }, "*");
    userInput.value = "";
    userInput.style.height = "auto";
    sendBtn.disabled = true;
  }
};

chatForm.addEventListener("submit", handleSubmit);

userInput.addEventListener("input", () => {
  sendBtn.disabled = userInput.value.trim() === "";
  autoExpand(userInput);
});

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSubmit(e);
  }
});

closeBtn.addEventListener("click", () => {
  window.parent.postMessage({ type: "CLOSE_CHATBOT" }, "*");
});

actionDropdownBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  actionDropdownContent.style.display =
    actionDropdownContent.style.display === "block" ? "none" : "block";
});

document.addEventListener("click", () => {
  actionDropdownContent.style.display = "none";
});

actionDropdownContent.addEventListener("click", (e) => {
  e.stopPropagation();
  if (e.target.classList.contains("action-btn")) {
    const action = e.target.dataset.action;
    addMessage(`Action: ${action.toUpperCase()}`, true);
    window.parent.postMessage({ type: "ACTION_BUTTON", action }, "*");
    actionDropdownContent.style.display = "none";
  }
});

window.addEventListener("message", (event) => {
  if (event.data.type === "CHATBOT_RESPONSE") {
    removeLoader();
    addMessage(event.data.answer);
    sendBtn.disabled = userInput.value.trim() === "";
  } else if (event.data.type === "CHATBOT_ERROR") {
    removeLoader();
    addMessage(`Error: ${event.data.error}`);
    sendBtn.disabled = userInput.value.trim() === "";
  } else if (event.data.type === "CLEAR_CHAT") {
    chatMessages.innerHTML = "";
  } else if (event.data.type === "SUGGESTED_QUESTIONS") {
    addSuggestedQuestions(event.data.questions);
  } else if (event.data.type === "CHATBOT_LOADING") {
    sendBtn.disabled = event.data.loading;
  }
});

const autoExpand = (field) => {
  field.style.height = "inherit";
  const computed = window.getComputedStyle(field);
  const height =
    parseInt(computed.getPropertyValue("border-top-width"), 8) +
    parseInt(computed.getPropertyValue("padding-top"), 8) +
    field.scrollHeight +
    parseInt(computed.getPropertyValue("padding-bottom"), 8) +
    parseInt(computed.getPropertyValue("border-bottom-width"), 8);

  field.style.height = `${height}px`;
};
