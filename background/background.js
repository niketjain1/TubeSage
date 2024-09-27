importScripts("../lib/crypto-js.min.js");

const ENCRYPTION_KEY = "S8g$5qW7pR9nE2fX#dV1zK3tU!xP6uM@jH0yC4iB^vL";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["encryptedApiKey"], (result) => {
    if (!result.encryptedApiKey) {
      chrome.tabs.create({ url: "options/options.html" });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "encryptAndStoreApiKey") {
    console.log("Received request to encrypt and store API key");
    try {
      const encryptedApiKey = CryptoJS.AES.encrypt(
        request.apiKey,
        ENCRYPTION_KEY
      ).toString();
      console.log("API key encrypted successfully");

      chrome.storage.local.set({ encryptedApiKey: encryptedApiKey }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error storing API key:", chrome.runtime.lastError);
          sendResponse({
            success: false,
            error: chrome.runtime.lastError.message,
          });
        } else {
          console.log("API key stored successfully");
          // Verify the storage
          chrome.storage.local.get(["encryptedApiKey"], (result) => {
            if (result.encryptedApiKey === encryptedApiKey) {
              console.log("Storage verification successful");
              sendResponse({ success: true });
            } else {
              console.error("Storage verification failed");
              sendResponse({
                success: false,
                error: "Storage verification failed",
              });
            }
          });
        }
      });
    } catch (error) {
      console.error("Error encrypting API key:", error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Indicates that the response is asynchronous
  } else if (request.action === "getApiKey") {
    console.log("Received request to get API key");
    chrome.storage.local.get(["encryptedApiKey"], (result) => {
      if (result.encryptedApiKey) {
        try {
          const decryptedApiKey = CryptoJS.AES.decrypt(
            result.encryptedApiKey,
            ENCRYPTION_KEY
          ).toString(CryptoJS.enc.Utf8);
          console.log("API key decrypted successfully");
          sendResponse({ apiKey: decryptedApiKey });
        } catch (error) {
          console.error("Error decrypting API key:", error);
          sendResponse({ apiKey: null, error: error.message });
        }
      } else {
        console.log("No stored API key found");
        sendResponse({ apiKey: null });
      }
    });
    return true; // Indicates that the response is asynchronous
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
