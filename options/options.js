document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const saveButton = document.getElementById("save");

  console.log({ saveButton });

  saveButton.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    console.log("API Key:", apiKey);
    if (apiKey) {
      chrome.runtime.sendMessage(
        { action: "encryptAndStoreApiKey", apiKey: apiKey },
        (response) => {
          if (response && response.success) {
            alert("API Key saved successfully!");
            // Verify storage
            chrome.storage.local.get(["encryptedApiKey"], (result) => {
              if (result.encryptedApiKey) {
                console.log("Encrypted API key found in storage");
              } else {
                console.error("Encrypted API key not found in storage");
              }
            });
            window.close();
          } else {
            const errorMessage =
              response && response.error ? response.error : "Unknown error";
            console.error("Error saving API key:", errorMessage);
            alert(`Error saving API Key: ${errorMessage}. Please try again.`);
          }
        }
      );
    } else {
      console.log("API key is empty");
      alert("Please enter a valid API Key.");
    }
  });
});

// Log when the script is loaded
console.log("Options script loaded");
