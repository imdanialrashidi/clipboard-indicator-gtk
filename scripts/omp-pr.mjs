#!/usr/bin/env node
// A narrow delivery capability, not an arbitrary Git/shell executor.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HEAD = "ai-changes";
const BASE = "main";
const REMOTE = "origin";
const BEGIN = "<!-- omp-pr:begin -->";
const END = "<!-- omp-pr:end -->";
const SHA = /^[0-9a-f]{40}$/;
const blockedPath = /(?:^|\/)(?:\.git|\.artifacts|node_modules|\.ssh|\.aws|\.kube|\.gnupg|\.npmrc|\.netrc|\.pypirc|credentials\.json)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx|jks|keystore)$|(?:^|\/)storageState.*\.json$/i;
const exampleEnv = /(?:^|\/)\.env\.(?:example|sample|template)$/i;
const secret = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9_]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bAKIA[0-9A-Z]{16}|\bsk-[A-Za-z0-9_-]{24,}/;

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

export function githubRepository(url) {
  const match = String(url).trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+?)(?:\.git)?$/);
  requireThat(match && !match[1].endsWith("/.") && !match[1].endsWith("/.."), "origin must be one credential-free github.com repository URL.");
  return match[1];
}

export function parseOptions(argv) {
  const [action, ...args] = argv;
  requireThat(["prepare", "deliver"].includes(action), "Use prepare or deliver; branch, base, and remote are fixed.");
  const result = { action, files: [] };
  const names = { "--message": "message", "--title": "title", "--body-file": "bodyFile", "--pr": "pr", "--resume": "resume" };
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    requireThat((key === "--file" || names[key]) && typeof value === "string" && value.length > 0, "Unknown or incomplete delivery option.");
    if (key === "--file") result.files.push(value);
    else {
      requireThat(result[names[key]] === undefined, "Duplicate delivery option: " + key);
      result[names[key]] = value;
    }
  }
  if (result.pr !== undefined) {
    requireThat(/^[1-9][0-9]*$/.test(result.pr), "--pr must identify the existing related PR.");
    result.pr = Number(result.pr);
    requireThat(Number.isSafeInteger(result.pr), "Invalid PR number.");
  }
  if (action === "prepare") {
    requireThat(!result.message && !result.title && !result.bodyFile && !result.resume && !result.files.length, "prepare accepts only an optional --pr.");
  } else {
    requireThat(result.title && result.bodyFile, "deliver requires --title and --body-file.");
    for (const text of [result.title, result.message].filter(Boolean)) {
      requireThat(text.trim().length > 0 && text.length <= 200 && !/[\r\n\0]/.test(text), "Title/message must be a non-empty single line of at most 200 characters.");
      requireThat(!secret.test(text), "Credential-like material in delivery metadata.");
    }
    if (result.resume) requireThat(SHA.test(result.resume) && !result.message && !result.files.length, "--resume requires an exact previously verified SHA, without --message or --file.");
    else requireThat(result.message && result.files.length, "A new commit requires --message and explicit --file paths.");
  }
  return result;
}

function relativeFile(file, cwd, { body = false } = {}) {
  requireThat(typeof file === "string" && file && !/[\0\r\n\\:*?[\]]/.test(file) && !path.isAbsolute(file), "Use exact repository-relative file paths, not globs or pathspecs.");
  requireThat(!file.split("/").some((part) => ["", ".", ".."].includes(part)), "Path traversal and directory arguments are not allowed.");
  const allowedExample = exampleEnv.test(file) && !blockedPath.test(path.posix.dirname(file));
  requireThat((body && file.startsWith(".artifacts/") && !blockedPath.test(file.slice(11))) || !blockedPath.test(file) || allowedExample, "Sensitive or generated paths are excluded from delivery.");
  let current = cwd;
  for (const part of file.split("/")) {
    current = path.join(current, part);
    if (existsSync(current)) requireThat(!lstatSync(current).isSymbolicLink(), "Symlink paths require owner review.");
  }
  if (existsSync(current)) requireThat(lstatSync(current).isFile(), "Select files, not directories.");
  else requireThat(!body, "PR evidence file does not exist.");
  return file;
}

function readSafe(file, cwd, maxBytes) {
  const absolute = path.join(cwd, file);
  if (!existsSync(absolute)) return ""; // Explicit tracked deletion.
  requireThat(lstatSync(absolute).size <= maxBytes, "File exceeds the automatic-delivery size limit: " + file);
  const text = readFileSync(absolute, "utf8");
  requireThat(!secret.test(text), "Credential-like material detected; nothing should be published: " + file);
  return text;
}

export function runDelivery(argv, { cwd = process.cwd(), env = process.env, run = spawnSync } = {}) {
  const options = parseOptions(argv);
  requireThat((env.OMP_PR_DELIVERY ?? "on") === "on", "Automatic PR delivery is disabled in this local-only or evaluation session.");
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_CONFIG_COUNT"]) {
    requireThat(!env[key], "Custom Git context is not allowed in automatic delivery: " + key);
  }
  cwd = realpathSync(cwd);
  const childEnv = { ...env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" };
  function command(program, args, { input, soft = false } = {}) {
    const result = run(program, args, { cwd, env: childEnv, input, encoding: "utf8", shell: false, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
    if (soft && result.status === 1) return null;
    requireThat(!result.error && result.status === 0, program + " " + args[0] + " failed; inspect local/remote state before retrying. No reset or history rewrite was attempted.");
    return result.stdout ?? "";
  }
  const git = (args, soft = false) => command("git", args, { soft });
  requireThat(realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) === cwd, "Run the helper from the repository root.");
  const artifacts = path.join(cwd, ".artifacts");
  if (existsSync(artifacts)) requireThat(!lstatSync(artifacts).isSymbolicLink(), "The artifact directory must not be a symlink.");
  mkdirSync(artifacts, { recursive: true });
  const lock = path.join(artifacts, "omp-pr.lock");
  const receiptPath = path.join(artifacts, "omp-pr-receipt.json");
  let lockFd;
  try { lockFd = openSync(lock, "wx"); }
  catch { throw new Error("Another delivery may be active. Inspect .artifacts/omp-pr.lock; never clear a live writer's lock."); }
  try {
    function api(endpoint, method = "GET", payload) {
      const args = ["api", "--hostname", "github.com", "--method", method, endpoint];
      if (payload !== undefined) args.push("--input", "-");
      return JSON.parse(command("gh", args, { input: payload === undefined ? undefined : JSON.stringify(payload) }));
    }
    const urls = git(["remote", "get-url", "--all", REMOTE]).trim().split("\n");
    const pushUrls = git(["remote", "get-url", "--push", "--all", REMOTE]).trim().split("\n");
    requireThat(urls.length === 1 && pushUrls.length === 1, "Multiple origin URLs require owner review.");
    const repo = githubRepository(urls[0]);
    requireThat(githubRepository(pushUrls[0]).toLowerCase() === repo.toLowerCase(), "Fetch and push repositories differ.");
    const info = api("repos/" + repo);
    requireThat(info.full_name?.toLowerCase() === repo.toLowerCase() && info.default_branch === BASE, "Repository identity or default branch differs from the reviewed main target.");
    const currentBranch = () => git(["branch", "--show-current"]).trim();
    const sha = (ref = "HEAD") => git(["rev-parse", "--verify", ref]).trim();
    const cleanIndex = () => requireThat(git(["diff", "--cached", "--quiet"], true) !== null, "Pre-existing staged changes must remain owner-controlled.");
    const cleanTree = () => requireThat(!git(["status", "--porcelain=v1", "--untracked-files=all"]).trim(), "A clean worktree is required for prepare/resume; preserve user changes.");
    const remoteHead = (allowMissing = false) => {
      const output = git(["ls-remote", "--heads", REMOTE, "refs/heads/" + HEAD]).trim();
      if (!output && allowMissing) return null;
      const value = output.split(/\s+/);
      requireThat(value.length === 2 && SHA.test(value[0]) && value[1] === "refs/heads/" + HEAD, "The fixed remote ai-changes branch is missing. Preserve current work; only a clean prepare may create it.");
      return value[0];
    };
    for (const name of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"]) {
      requireThat(!existsSync(path.resolve(cwd, git(["rev-parse", "--git-path", name]).trim())), "An in-progress Git operation must be resolved before delivery.");
    }
    cleanIndex();
    if (options.action === "prepare" || options.resume) cleanTree();
    else requireThat(currentBranch() === HEAD, "Delivery is allowed only on ai-changes; run prepare before editing. Never commit on main.");
    let expectedRemote = remoteHead(options.action === "prepare");
    git(["fetch", "--no-tags", REMOTE, "refs/heads/" + BASE + ":refs/remotes/origin/" + BASE, ...(expectedRemote ? ["refs/heads/" + HEAD + ":refs/remotes/origin/" + HEAD] : [])]);
    const baseCommit = sha("origin/" + BASE);
    const pulls = (state) => api("repos/" + repo + "/pulls?state=" + state + "&head=" + repo.split("/")[0] + "%3A" + HEAD + "&base=" + BASE + "&per_page=100");
    const validatePull = (pr) => {
      requireThat(pr.head?.repo?.full_name?.toLowerCase() === repo.toLowerCase() && pr.base?.repo?.full_name?.toLowerCase() === repo.toLowerCase() && pr.head.ref === HEAD && pr.base.ref === BASE, "PR repository or head/base mismatch.");
      return pr;
    };
    const openPulls = pulls("open");
    requireThat(Array.isArray(openPulls) && openPulls.length <= 1, "Ambiguous open PR state.");
    const existing = openPulls[0] ? validatePull(openPulls[0]) : null;
    requireThat(existing ? options.pr === existing.number : options.pr === undefined, "An existing PR needs its exact --pr number and related task scope; do not mix unrelated work or create another branch.");
    if (!expectedRemote) {
      requireThat(!existing, "An open PR has a missing source branch; inspect its work before preparing another task.");
      const localExists = git(["show-ref", "--verify", "--quiet", "refs/heads/" + HEAD], true) !== null;
      requireThat(!localExists || git(["merge-base", "--is-ancestor", HEAD, baseCommit], true) !== null, "Unpublished or unmerged local ai-changes commits require inspection before recreating the remote branch.");
      // Create-only API: a competing creator must fail, never overwrite an existing ref.
      const created = api("repos/" + repo + "/git/refs", "POST", { ref: "refs/heads/" + HEAD, sha: baseCommit });
      requireThat(created.ref === "refs/heads/" + HEAD && created.object?.sha === baseCommit && remoteHead() === baseCommit, "Branch creation did not match the captured main commit; inspect remote state.");
      expectedRemote = baseCommit;
      git(["fetch", "--no-tags", REMOTE, "refs/heads/" + HEAD + ":refs/remotes/origin/" + HEAD]);
    }
    requireThat(sha("origin/" + HEAD) === expectedRemote, "The source branch changed during preflight; inspect the concurrent update.");
    const push = (commit) => {
      requireThat(SHA.test(commit) && currentBranch() === HEAD && sha() === commit && remoteHead() === expectedRemote, "Branch changed before push; preserve state and inspect the concurrent writer.");
      requireThat(git(["merge-base", "--is-ancestor", expectedRemote, commit], true) !== null, "Automatic delivery must fast-forward the exact expected remote commit.");
      // The non-empty exact lease is only a compare-and-swap guard. The immutable
      // ancestor check above forbids history rewrites even though Git names it force-with-lease.
      git(["push", "--force-with-lease=refs/heads/" + HEAD + ":" + expectedRemote, "--no-follow-tags", "--recurse-submodules=no", REMOTE, commit + ":refs/heads/" + HEAD]);
      requireThat(remoteHead() === commit && currentBranch() === HEAD && sha() === commit, "Remote or local SHA changed after push; inspect before continuing.");
    };

    if (options.action === "prepare") {
      const localExists = git(["show-ref", "--verify", "--quiet", "refs/heads/" + HEAD], true) !== null;
      if (localExists) {
        requireThat(git(["merge-base", "--is-ancestor", HEAD, "origin/" + HEAD], true) !== null, "Unpublished local commits require inspection; do not overwrite or publish them implicitly.");
        git(["switch", "--no-overwrite-ignore", HEAD]);
        git(["merge", "--no-overwrite-ignore", "--ff-only", "origin/" + HEAD]);
      } else git(["switch", "--no-overwrite-ignore", "--track", "-c", HEAD, "origin/" + HEAD]);
      requireThat(sha() === expectedRemote, "Local branch changed during prepare; inspect the concurrent writer.");
      let prepared = expectedRemote;
      if (!existing) {
        const ancestor = git(["merge-base", "--is-ancestor", expectedRemote, baseCommit], true) !== null;
        if (!ancestor) {
          const merged = pulls("closed").some((pr) => pr.merged_at && pr.head?.sha === expectedRemote && validatePull(pr));
          requireThat(merged, "ai-changes contains unpublished or unmerged work; do not reuse it for a different task.");
        }
        // Preserve history after merge, squash, or rebase integration. Conflicts stop in place.
        git(["merge", "--no-overwrite-ignore", "--no-edit", baseCommit]);
        prepared = sha();
        if (prepared !== expectedRemote && prepared !== baseCommit) {
          requireThat(git(["show", "-s", "--format=%P", prepared]).trim() === expectedRemote + " " + baseCommit, "Unexpected synchronization parents; do not publish unknown local history.");
        }
        requireThat(git(["diff", "--quiet", baseCommit, prepared], true) !== null, "Idle ai-changes must have the same tree as main before new work.");
        if (prepared !== expectedRemote) push(prepared);
      }
      requireThat(currentBranch() === HEAD && sha() === prepared, "Local branch changed after prepare.");
      return { status: "prepared", repository: repo, branch: HEAD, commit: prepared, pr: existing?.number ?? null };
    }

    const bodyFile = relativeFile(options.bodyFile, cwd, { body: true });
    const evidence = readSafe(bodyFile, cwd, 64 * 1024);
    requireThat(evidence.trim().length >= 20 && !evidence.includes(BEGIN) && !evidence.includes(END), "Supply a substantive, sanitized PR summary with exact verification evidence, without managed markers.");
    const body = BEGIN + "\n" + evidence.trim() + "\n" + END;
    let commit = options.resume;
    if (options.resume) {
      requireThat(sha() === options.resume && currentBranch() === HEAD, "--resume must match the already verified local ai-changes HEAD.");
      requireThat(existsSync(receiptPath) && !lstatSync(receiptPath).isSymbolicLink(), "No matching helper delivery receipt; unknown commits cannot be resumed.");
      const receipt = JSON.parse(readSafe(".artifacts/omp-pr-receipt.json", cwd, 64 * 1024));
      requireThat(receipt.repository === repo && receipt.branch === HEAD && receipt.commit === commit && receipt.parent === sha(commit + "^") && receipt.tree === sha(commit + "^{tree}"), "Delivery receipt does not match the exact repository, commit, and tree.");
      requireThat(Array.isArray(receipt.files) && receipt.files.length > 0, "Delivery receipt has no task file scope.");
      const recorded = [...new Set(receipt.files.map((file) => relativeFile(file, cwd)))].sort();
      const committed = git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "-z", commit]).split("\0").filter(Boolean).sort();
      requireThat(JSON.stringify(recorded) === JSON.stringify(committed), "Delivery receipt differs from committed file scope.");
      for (const file of recorded) readSafe(file, cwd, 8 * 1024 * 1024);
      requireThat(git(["merge-base", "--is-ancestor", expectedRemote, commit], true) !== null, "Resume cannot overwrite a concurrent remote update.");
      requireThat(Number(git(["rev-list", "--count", expectedRemote + ".." + commit]).trim()) <= 1, "Resume may publish at most the single previously verified commit.");
    } else {
      requireThat(sha() === expectedRemote, "Unpublished local commits exist; inspect them instead of bundling them into this task.");
      if (!existing) requireThat(git(["diff", "--quiet", baseCommit, expectedRemote], true) !== null, "Run prepare to synchronize the idle branch before editing.");
      const files = [...new Set(options.files.map((file) => relativeFile(file, cwd)))];
      const dirty = new Set(git(["status", "--porcelain=v1", "--no-renames", "-z", "--untracked-files=all"]).split("\0").filter(Boolean).map((entry) => entry.slice(3)));
      for (const file of files) {
        requireThat(dirty.has(file), "Each --file must be an actual changed file: " + file);
        readSafe(file, cwd, 8 * 1024 * 1024);
      }
      git(["--literal-pathspecs", "diff", "--check", "--", ...files]);
      git(["--literal-pathspecs", "add", "--", ...files]);
      const staged = git(["diff", "--cached", "--name-only", "--no-renames", "-z"]).split("\0").filter(Boolean).sort();
      requireThat(JSON.stringify(staged) === JSON.stringify([...files].sort()), "Staged scope differs from the explicit task files; inspect without resetting user work.");
      git(["diff", "--cached", "--check"]);
      const tree = git(["write-tree"]).trim();
      const parent = expectedRemote;
      requireThat(sha() === parent, "Local branch changed before commit; do not bundle unknown history.");
      git(["--literal-pathspecs", "commit", "--only", "-m", options.message, "--", ...files]);
      commit = sha();
      requireThat(sha(commit + "^") === parent && sha(commit + "^{tree}") === tree, "A hook or concurrent writer changed the reviewed commit; rerun evidence before publishing.");
      requireThat(!existsSync(receiptPath) || !lstatSync(receiptPath).isSymbolicLink(), "Delivery receipt must not be a symlink.");
      writeFileSync(receiptPath, JSON.stringify({ repository: repo, branch: HEAD, commit, parent, tree, files }) + "\n");
    }
    requireThat(currentBranch() === HEAD && sha() === commit, "Local branch changed after verification; do not publish another writer's commit.");
    const patch = git(["diff", baseCommit + "..." + commit]);
    requireThat(patch.trim() && !secret.test(patch), "No PR diff or credential-like material in the committed diff; publication stopped.");
    if (commit !== expectedRemote) push(commit);
    const payload = { title: options.title, body };
    let pr;
    let evidenceUrl;
    if (existing) {
      pr = validatePull(api("repos/" + repo + "/pulls/" + existing.number));
      requireThat(pr.state === "open" && !pr.merged && pr.head.sha === commit, "PR changed before evidence publication.");
      // Never PATCH a stale PR body/title: append evidence so concurrent owner notes survive.
      const marker = "<!-- omp-pr-evidence:" + commit + ":" + createHash("sha256").update(body).digest("hex").slice(0, 16) + " -->";
      const commentBody = marker + "\n" + body;
      const commentsEndpoint = "repos/" + repo + "/issues/" + pr.number + "/comments";
      const findEvidence = () => {
        for (let page = 1; page <= 10; page++) {
          const comments = api(commentsEndpoint + "?per_page=100&page=" + page);
          requireThat(Array.isArray(comments), "Invalid PR evidence response.");
          const found = comments.find((item) => item.body === commentBody);
          if (found) return found;
          if (comments.length < 100) return null;
        }
        throw new Error("PR evidence history exceeds the bounded lookup; inspect before posting.");
      };
      let comment = findEvidence();
      if (!comment) {
        try { comment = api(commentsEndpoint, "POST", { body: commentBody }); }
        catch (error) { comment = findEvidence(); if (!comment) throw error; }
      }
      const saved = api("repos/" + repo + "/issues/comments/" + comment.id);
      requireThat(saved.body === commentBody && saved.html_url === "https://github.com/" + repo + "/pull/" + pr.number + "#issuecomment-" + comment.id, "PR evidence comment verification failed.");
      evidenceUrl = saved.html_url;
    } else {
      try { pr = api("repos/" + repo + "/pulls", "POST", { ...payload, head: HEAD, base: BASE, draft: false }); }
      catch (error) {
        // A successful create can lose its response. Discover it; never blindly duplicate it.
        const discovered = pulls("open");
        if (discovered.length !== 1 || discovered[0].head?.sha !== commit || discovered[0].body !== body) throw error;
        pr = discovered[0];
      }
    }
    const verified = validatePull(api("repos/" + repo + "/pulls/" + pr.number));
    requireThat(verified.state === "open" && !verified.merged && verified.head.sha === commit, "PR verification did not match the intended commit.");
    if (!existing) requireThat(verified.body === body && verified.title === options.title, "New PR metadata changed during publication; inspect it before claiming completion.");
    requireThat(verified.html_url === "https://github.com/" + repo + "/pull/" + verified.number, "Unexpected PR URL.");
    return { status: "published", repository: repo, branch: HEAD, commit, pr: verified.number, url: verified.html_url, ...(evidenceUrl ? { evidenceUrl } : {}) };
  } finally {
    closeSync(lockFd);
    unlinkSync(lock);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(runDelivery(process.argv.slice(2))) + "\n"); }
  catch (error) {
    process.stderr.write("omp-pr: " + error.message + "\nLocal changes/commits are preserved. Inspect git status and the remote before resuming; never force, reset, or auto-merge.\n");
    process.exitCode = 1;
  }
}
