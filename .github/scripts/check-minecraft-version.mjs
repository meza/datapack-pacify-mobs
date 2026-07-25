import { readFile } from "node:fs/promises";

const STABLE_RELEASE_PATTERN = /^\d+\.\d+(?:\.\d+)?$/;

function fail(message) {
  throw new Error(message);
}

async function readJson(path, description) {
  let contents;

  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    fail(`Unable to read ${description} at ${path}: ${error.message}`);
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    fail(`Invalid JSON in ${description} at ${path}: ${error.message}`);
  }
}

function parseMinecraftVersion(version) {
  if (!STABLE_RELEASE_PATTERN.test(version)) {
    return null;
  }

  const parts = version.split(".").map(Number);
  while (parts.length < 3) {
    parts.push(0);
  }

  return parts;
}

function compareMinecraftVersions(left, right) {
  const leftParts = parseMinecraftVersion(left);
  const rightParts = parseMinecraftVersion(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function findLatestUpdate(packMetadata, versionMap) {
  const currentMaxFormat = packMetadata?.pack?.max_format;
  if (typeof currentMaxFormat !== "number" || !Number.isFinite(currentMaxFormat)) {
    fail("pack.mcmeta must contain a finite numeric pack.max_format value");
  }

  if (versionMap === null || Array.isArray(versionMap) || typeof versionMap !== "object") {
    fail("Minecraft pack-version data must be a JSON object");
  }

  let latestUpdate = null;

  for (const [version, formats] of Object.entries(versionMap)) {
    if (parseMinecraftVersion(version) === null) {
      continue;
    }

    const datapackFormat = formats?.datapack;
    if (typeof datapackFormat !== "number" || !Number.isFinite(datapackFormat)) {
      fail(`Stable Minecraft release ${version} has an invalid datapack format`);
    }

    if (datapackFormat <= currentMaxFormat) {
      continue;
    }

    if (latestUpdate === null || compareMinecraftVersions(version, latestUpdate.version) > 0) {
      latestUpdate = { version, datapackFormat, currentMaxFormat };
    }
  }

  return latestUpdate;
}

function requiredEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} must be set when an update issue is required`);
  }

  return value;
}

function issueBody(update) {
  return `Minecraft ${update.version} is a stable release with datapack format ${update.datapackFormat}. This datapack currently declares max_format ${update.currentMaxFormat} and needs to be updated for the new release.

## Goal

Update the datapack to support Minecraft ${update.version}.

## Context

Follow all repository guidance. In particular, follow \`.agents/skills/updating-for-newer-minecraft/SKILL.md\` and inspect every relevant Minecraft Java Edition changelog since the release represented by the current \`max_format\`.

## Requirements

- Update every affected file under \`src\`.
- Set \`pack.max_format\` to ${update.datapackFormat}.
- Preserve \`pack.min_format\` unless compatibility requires changing it.
- Run all feasible validation and report the commands and results.
- Clearly identify any validation that requires testing in an actual Minecraft client.

## Delivery

- Push the implementation branch.
- Open a pull request against \`main\`.
- Make the pull request ready for review, not draft.
- Enable merge auto-merge so the pull request merges after all required checks pass.
- If repository permissions or settings prevent auto-merge, report the blocker explicitly on the issue or pull request.
- Do not stop after preparing a diff; complete the branch and pull-request handoff.

@codex please implement this`;
}

async function githubRequest(apiUrl, token, path, options = {}) {
  const method = options.method ?? "GET";
  let response;

  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...options.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    fail(`GitHub API ${method} ${path} failed: ${error.message}`);
  }

  const responseText = await response.text();
  let responseBody = null;

  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
  }

  if (!response.ok) {
    const details = typeof responseBody === "object" ? responseBody?.message : responseBody;
    fail(`GitHub API ${method} ${path} failed with ${response.status}: ${details ?? "unknown error"}`);
  }

  return responseBody;
}

async function findOpenIssue(apiUrl, token, repositoryPath, title) {
  for (let page = 1; ; page += 1) {
    const issues = await githubRequest(
      apiUrl,
      token,
      `${repositoryPath}/issues?state=open&per_page=100&page=${page}`,
    );

    if (!Array.isArray(issues)) {
      fail("GitHub returned an invalid response while listing open issues");
    }

    const matchingIssue = issues.find((issue) => issue.pull_request === undefined && issue.title === title);
    if (matchingIssue) {
      return matchingIssue;
    }

    if (issues.length < 100) {
      return null;
    }
  }
}

async function createUpdateIssue(update) {
  const token = requiredEnvironmentVariable("GITHUB_TOKEN");
  const repository = requiredEnvironmentVariable("GITHUB_REPOSITORY");
  const apiUrl = requiredEnvironmentVariable("GITHUB_API_URL").replace(/\/$/, "");
  const repositoryParts = repository.split("/");

  if (repositoryParts.length !== 2 || repositoryParts.some((part) => part.length === 0)) {
    fail("GITHUB_REPOSITORY must use the owner/repository format");
  }

  const repositoryPath = `/repos/${repositoryParts.map(encodeURIComponent).join("/")}`;
  const title = `Update datapack to Minecraft ${update.version}`;
  const existingIssue = await findOpenIssue(apiUrl, token, repositoryPath, title);

  if (existingIssue) {
    console.log(`Open update issue already exists: ${existingIssue.html_url}`);
    return;
  }

  const createdIssue = await githubRequest(apiUrl, token, `${repositoryPath}/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body: issueBody(update) }),
  });

  if (!createdIssue?.html_url) {
    fail("GitHub created the issue but returned an invalid response");
  }

  console.log(`Created Minecraft update issue: ${createdIssue.html_url}`);
}

async function main() {
  const [packMetadataPath, versionMapPath, ...unexpectedArguments] = process.argv.slice(2);

  if (!packMetadataPath || !versionMapPath || unexpectedArguments.length > 0) {
    fail("Usage: node check-minecraft-version.mjs <pack.mcmeta path> <version-map path>");
  }

  const [packMetadata, versionMap] = await Promise.all([
    readJson(packMetadataPath, "pack metadata"),
    readJson(versionMapPath, "Minecraft pack-version data"),
  ]);
  const update = findLatestUpdate(packMetadata, versionMap);

  if (update === null) {
    console.log("No stable Minecraft release requires a datapack update.");
    return;
  }

  console.log(
    `Minecraft ${update.version} uses datapack format ${update.datapackFormat}, ` +
      `which is newer than max_format ${update.currentMaxFormat}.`,
  );
  await createUpdateIssue(update);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
