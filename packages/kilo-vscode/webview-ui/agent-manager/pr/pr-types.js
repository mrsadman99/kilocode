// PR types — source of truth for all PR-related types used by the PR panel and
// the extension/webview message boundary.
export const PR_REACTION_CONTENT = [
    "THUMBS_UP",
    "THUMBS_DOWN",
    "LAUGH",
    "HOORAY",
    "CONFUSED",
    "HEART",
    "ROCKET",
    "EYES",
];
/** Comments and reviews render as cards; commits and events render as rows. */
export function isConversationComment(item) {
    return item.kind !== "commit" && item.kind !== "event";
}
//# sourceMappingURL=pr-types.js.map