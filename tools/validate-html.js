#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = process.cwd();

function countMatches(value, expression) {
  return (value.match(expression) || []).length;
}

function stripNonStructuralBlocks(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
}

function checkPair(errors, file, source, tag, options = {}) {
  const opens = countMatches(source, new RegExp(`<${tag}\\b`, "gi"));
  const closes = countMatches(source, new RegExp(`</${tag}\\s*>`, "gi"));

  if (opens !== closes) {
    errors.push(`${file}: <${tag}> count ${opens} does not match </${tag}> count ${closes}.`);
  }

  if (typeof options.maximum === "number" && opens > options.maximum) {
    errors.push(`${file}: expected at most ${options.maximum} <${tag}> element(s), found ${opens}.`);
  }

  if (typeof options.minimum === "number" && opens < options.minimum) {
    errors.push(`${file}: expected at least ${options.minimum} <${tag}> element(s), found ${opens}.`);
  }
}

function scriptType(attributes) {
  const match = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i);
  return match ? match[1].trim().toLowerCase() : "";
}

function formatScriptError(error) {
  const stack = String(error && error.stack ? error.stack : error && error.message ? error.message : error);
  return stack.split("\n").slice(0, 4).join(" | ");
}

function validateScripts(errors, file, html) {
  const scriptExpression = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  let inlineIndex = 0;

  while ((match = scriptExpression.exec(html)) !== null) {
    const attributes = match[1] || "";
    const body = match[2] || "";
    const type = scriptType(attributes);

    if (/\bsrc\s*=/i.test(attributes)) continue;
    if (type === "application/ld+json") continue;
    if (type === "module") continue;
    if (!body.trim()) continue;

    inlineIndex += 1;
    try {
      new vm.Script(body, { filename: `${file}:inline-script-${inlineIndex}` });
    } catch (error) {
      errors.push(`${file}: inline JavaScript ${inlineIndex} is invalid: ${formatScriptError(error)}`);
    }
  }
}

function validateFile(filePath) {
  const file = path.relative(ROOT, filePath);
  const html = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const errors = [];

  if (!/^\s*<!doctype\s+html>/i.test(html)) {
    errors.push(`${file}: missing <!DOCTYPE html> at the start of the document.`);
  }

  if (/<!--\s*NAV:START\s*-->/i.test(html) || /<!--\s*NAV:END\s*-->/i.test(html)) {
    errors.push(`${file}: contains obsolete NAV:START/NAV:END markers.`);
  }

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (!titleMatch || !titleMatch[1].trim()) {
    errors.push(`${file}: missing a non-empty <title>.`);
  }

  const structural = stripNonStructuralBlocks(html);
  checkPair(errors, file, structural, "html", { minimum: 1, maximum: 1 });
  checkPair(errors, file, structural, "head", { minimum: 1, maximum: 1 });
  checkPair(errors, file, structural, "body", { minimum: 1, maximum: 1 });
  checkPair(errors, file, structural, "main", { maximum: 1 });
  checkPair(errors, file, structural, "nav", { minimum: 1 });
  checkPair(errors, file, structural, "div");

  validateScripts(errors, file, html);
  return errors;
}

function main() {
  const files = fs.readdirSync(ROOT)
    .filter((name) => name.toLowerCase().endsWith(".html"))
    .map((name) => path.join(ROOT, name))
    .sort();

  const errors = files.flatMap(validateFile);

  if (errors.length) {
    console.error(`Structural validation failed with ${errors.length} error(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`Structural validation passed for ${files.length} root HTML document(s).`);
}

main();
