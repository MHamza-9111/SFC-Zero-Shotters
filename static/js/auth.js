"use strict";

const form = document.getElementById("auth-form");
const errorNode = document.getElementById("auth-error");
const mode = document.body.dataset.authMode;

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorNode.textContent = "";
    const values = Object.fromEntries(new FormData(form).entries());
    const endpoint = mode === "register" ? "/api/v1/auth/signup" : "/api/v1/auth/login";
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(values),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Account request failed.");
        const destination = new URL(document.body.dataset.next || "/", window.location.origin);
        window.location.assign(destination.origin === window.location.origin ? destination.pathname + destination.search : "/");
    } catch (error) {
        errorNode.textContent = error.message;
    } finally {
        button.disabled = false;
    }
});
