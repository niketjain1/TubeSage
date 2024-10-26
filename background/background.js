importScripts("../lib/crypto-js.min.js");

// const randomNumber = Math.floor(Math.random() * 1000000);
const ENCRYPTION_KEY = `S8g$5qW7pR9nE2fX#dV1zK3tU!xP6uM@jH0yC4iB^vL`;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["encryptedApiKey"], (result) => {
    if (!result.encryptedApiKey) {
      chrome.tabs.create({ url: "options/options.html" });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "encryptAndStoreApiKey") {
    const userProvidedKey = prompt(
      "Enter a secure password to encrypt your API key:"
    );
    if (userProvidedKey) {
      const dynamicKey = CryptoJS.SHA256(userProvidedKey).toString();
      const encryptedApiKey = CryptoJS.AES.encrypt(
        request.apiKey,
        dynamicKey
      ).toString();

      chrome.storage.local.set({ encryptedApiKey }, () => {
        sendResponse({ success: true });
      });
    } else {
      sendResponse({ success: false, error: "Encryption key is required" });
    }
    return true;
  } else if (request.action === "getApiKey") {
    const userProvidedKey = prompt(
      "Enter the password to decrypt your API key:"
    );
    if (userProvidedKey) {
      const dynamicKey = CryptoJS.SHA256(userProvidedKey).toString();
      chrome.storage.local.get(["encryptedApiKey"], (result) => {
        if (result.encryptedApiKey) {
          try {
            const decryptedApiKey = CryptoJS.AES.decrypt(
              result.encryptedApiKey,
              dynamicKey
            ).toString(CryptoJS.enc.Utf8);
            sendResponse({ apiKey: decryptedApiKey });
          } catch (error) {
            sendResponse({ apiKey: null, error: "Failed to decrypt API key" });
          }
        } else {
          sendResponse({ apiKey: null });
        }
      });
    } else {
      sendResponse({ apiKey: null, error: "Decryption key is required" });
    }
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("youtube.com/watch")
  ) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content/content.js"],
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getApiKey") {
    chrome.storage.local.get(["encryptedApiKey"], (result) => {
      if (result.encryptedApiKey) {
        try {
          const decryptedApiKey = CryptoJS.AES.decrypt(
            result.encryptedApiKey,
            ENCRYPTION_KEY
          ).toString(CryptoJS.enc.Utf8);
          sendResponse({ apiKey: decryptedApiKey });
        } catch (error) {
          console.error("Error decrypting API key:", error);
          sendResponse({ apiKey: null, error: error.message });
        }
      } else {
        sendResponse({ apiKey: null });
      }
    });
    return true;
  }
});
