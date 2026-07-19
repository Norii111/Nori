window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  const message = event.data;

  if (
    !message ||
    message.source !== "command-center" ||
    message.type !== "INSTALL_USER_SCRIPT"
  ) {
    return;
  }

  try {
    const result = await chrome.runtime.sendMessage({
      type: "INSTALL_USER_SCRIPT",
      code: message.code
    });

    window.postMessage(
      {
        source: "command-extension",
        type: "INSTALL_RESULT",
        result
      },
      window.location.origin
    );
  } catch (error) {
    window.postMessage(
      {
        source: "command-extension",
        type: "INSTALL_RESULT",
        result: {
          success: false,
          error: error.message
        }
      },
      window.location.origin
    );
  }
});
