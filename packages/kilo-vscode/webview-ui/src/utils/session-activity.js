export function activity(input) {
    if (input.disconnected && (input.blocked || input.status === "busy" || input.status === "retry"))
        return "error";
    if (input.blocked)
        return "waiting";
    if (input.errored || input.status === "offline")
        return "error";
    if (input.status === "retry")
        return "retry";
    if (input.status === "busy")
        return "busy";
    if (input.finished)
        return "done";
    if (input.scheduled)
        return "scheduled";
    return "idle";
}
export function activities(input) {
    const blocked = new Set(input.blocked);
    const submitting = new Set(input.submitting);
    const suggested = new Set(input.suggested);
    const scheduled = new Set(input.scheduled);
    const ids = new Set([
        ...Object.keys(input.statuses),
        ...Object.keys(input.outcomes),
        ...blocked,
        ...submitting,
        ...suggested,
        ...scheduled,
    ]);
    const result = {};
    for (const id of ids) {
        const status = submitting.has(id) ? "busy" : input.statuses[id]?.type;
        const close = input.outcomes[id]?.reason;
        const active = activity({ status, blocked: blocked.has(id), disconnected: input.disconnected });
        const own = activity({
            status,
            blocked: blocked.has(id),
            disconnected: input.disconnected,
            errored: close === "error",
            finished: close ? close === "completed" && !input.outcomes[id]?.seen : suggested.has(id),
            scheduled: scheduled.has(id),
        });
        result[id] = strongest([result[id] ?? "idle", own]);
        if (active === "idle")
            continue;
        const seen = new Set([id]);
        for (let parent = input.parents.get(id); parent && !seen.has(parent); parent = input.parents.get(parent)) {
            seen.add(parent);
            result[parent] = strongest([result[parent] ?? "idle", active]);
        }
    }
    return result;
}
export function blockedSessionIds(permissions, questions) {
    return [...permissions, ...questions.filter((item) => item.blocking !== false)].map((item) => item.sessionID);
}
export function running(state) {
    return state === "busy" || state === "retry";
}
const STATES = ["scheduled", "done", "busy", "retry", "error", "waiting"];
export function score(state) {
    return STATES.indexOf(state) + 1;
}
export function isActivity(value) {
    return value === "idle" || (typeof value === "string" && STATES.includes(value));
}
export function strongest(states) {
    return states.reduce((best, state) => (score(state) > score(best) ? state : best), "idle");
}
const LABELS = {
    waiting: "task.backgroundAgents.needsInput",
    error: "task.backgroundAgents.status.error",
    retry: "session.status.retry",
    busy: "session.tabs.switcher.busy",
    done: "task.backgroundAgents.status.completed",
    scheduled: "session.tabs.switcher.scheduled",
    idle: "session.current",
};
export function label(state) {
    return LABELS[state];
}
export function description(state) {
    return `session.activity.${state}`;
}
//# sourceMappingURL=session-activity.js.map