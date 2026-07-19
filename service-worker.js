chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "INSTALL_USER_SCRIPT") {
    return;
  }

  installOrUpdateUserScript(message.code)
    .then((result) => sendResponse(result))
    .catch((error) => {
      sendResponse({
        success: false,
        error: error.message
      });
    });

  return true;
});

async function installOrUpdateUserScript(code) {
  if (typeof code !== "string" || !code.trim()) {
    throw new Error("The userscript is empty.");
  }

  const metadata = parseMetadata(code);

  if (!metadata.matches.length) {
    throw new Error("The userscript needs at least one @match entry.");
  }

  const scriptId = createScriptId(metadata.name);

  const registration = {
    id: scriptId,
    matches: metadata.matches,
    excludeMatches: metadata.excludeMatches,
    js: [{ code }],
    runAt: convertRunAt(metadata.runAt)
  };

  const existingScripts = await chrome.userScripts.getScripts({
    ids: [scriptId]
  });

  if (existingScripts.length > 0) {
    await chrome.userScripts.update([registration]);

    await saveScript(scriptId, code, metadata);

    return {
      success: true,
      action: "updated",
      scriptId,
      name: metadata.name
    };
  }

  await chrome.userScripts.register([registration]);

  await saveScript(scriptId, code, metadata);

  return {
    success: true,
    action: "installed",
    scriptId,
    name: metadata.name
  };
}

function parseMetadata(code) {
  const headerMatch = code.match(
    /\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/
  );

  if (!headerMatch) {
    throw new Error("No valid userscript metadata header was found.");
  }

  const header = headerMatch[1];

  return {
    name:
      getFirstMetadataValue(header, "name") ||
      "Unnamed Userscript",

    matches: getAllMetadataValues(header, "match"),

    excludeMatches: getAllMetadataValues(header, "exclude-match"),

    runAt:
      getFirstMetadataValue(header, "run-at") ||
      "document-idle"
  };
}

function getFirstMetadataValue(header, key) {
  const expression = new RegExp(
    `^\\s*//\\s*@${escapeRegExp(key)}\\s+(.+)$`,
    "mi"
  );

  return header.match(expression)?.[1]?.trim() || "";
}

function getAllMetadataValues(header, key) {
  const expression = new RegExp(
    `^\\s*//\\s*@${escapeRegExp(key)}\\s+(.+)$`,
    "gmi"
  );

  return [...header.matchAll(expression)].map((match) =>
    match[1].trim()
  );
}

function createScriptId(name) {
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  return safeName || `userscript-${Date.now()}`;
}

function convertRunAt(runAt) {
  const values = {
    "document-start": "document_start",
    "document-body": "document_end",
    "document-end": "document_end",
    "document-idle": "document_idle"
  };

  return values[runAt] || "document_idle";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function saveScript(scriptId, code, metadata) {
  await chrome.storage.local.set({
    [`userscript:${scriptId}`]: {
      code,
      metadata,
      updatedAt: new Date().toISOString()
    }
  });
}
