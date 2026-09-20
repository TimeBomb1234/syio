/* ==========================================================
   Syio: form handling, API call and rendering
   ========================================================== */

(() => {
  "use strict";

  const REQUEST_TIMEOUT_MS = 90000; // the server may retry once, so allow time
  const BUTTON_IDLE_TEXT = "Generate study notes";
  const BUTTON_BUSY_TEXT = "Generating…";

  // ---------- Element references ----------
  const form = document.getElementById("study-form");
  const button = document.getElementById("generate-btn");

  const emptyState = document.getElementById("empty-state");
  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("error-state");
  const errorMessage = document.getElementById("error-message");
  const results = document.getElementById("results");

  const resultTitle = document.getElementById("result-title");
  const resultBoard = document.getElementById("result-board");
  const resultClass = document.getElementById("result-class");
  const resultSubject = document.getElementById("result-subject");
  const summaryText = document.getElementById("summary-text");
  const conceptsList = document.getElementById("concepts-list");
  const keywordsList = document.getElementById("keywords-list");
  const questionsList = document.getElementById("questions-list");

  // ---------- UI state helpers ----------

  /** Show exactly one of: "empty" | "loading" | "error" | "results". */
  function showState(name) {
    emptyState.hidden = name !== "empty";
    loadingState.hidden = name !== "loading";
    errorState.hidden = name !== "error";
    results.hidden = name !== "results";
  }

  function setBusy(isBusy) {
    button.disabled = isBusy;
    button.textContent = isBusy ? BUTTON_BUSY_TEXT : BUTTON_IDLE_TEXT;
    form.setAttribute("aria-busy", String(isBusy));
  }

  function showError(message) {
    errorMessage.textContent = message;
    showState("error");
    scrollToResultsOnSmallScreens(errorState);
  }

  function scrollToResultsOnSmallScreens(element) {
    // On wide screens the results sit beside the form, so no scroll is needed.
    if (window.matchMedia("(max-width: 860px)").matches) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // ---------- Input handling ----------

  function readFormValues() {
    const data = new FormData(form);
    return {
      board: String(data.get("board") || "").trim(),
      class_level: String(data.get("class_level") || "").trim(),
      subject: String(data.get("subject") || "").trim(),
      chapter: String(data.get("chapter") || "").trim(),
      // From Settings (window.Syio is defined by settings.js)
      depth: (window.Syio && window.Syio.getPrefs().depth) || "balanced",
    };
  }

  /** Returns an error message, or "" if the values look fine. */
  function validate(values) {
    if (!values.subject) return "Enter a subject, for example Science.";
    if (!values.chapter) return "Enter a chapter name.";
    if (values.subject.length > 100) return "Subject must be 100 characters or fewer.";
    if (values.chapter.length > 100) return "Chapter name must be 100 characters or fewer.";
    return "";
  }

  // ---------- API call ----------

  function friendlyErrorForStatus(status, serverMessage) {
    if (status === 429) {
      return "You've hit the rate limit. Wait a minute, then try again.";
    }
    if (status === 400) {
      return serverMessage || "Some of your input isn't valid. Check the form and try again.";
    }
    if (status === 502) {
      return serverMessage || "The AI service had a problem. Try again in a moment.";
    }
    return serverMessage || "Something went wrong on our side. Try again in a moment.";
  }

  async function requestNotes(values) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        signal: controller.signal,
      });

      // The server should always reply with JSON, but don't assume it.
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (!response.ok) {
        const serverMessage = body && typeof body.error === "string" ? body.error : "";
        throw new Error(friendlyErrorForStatus(response.status, serverMessage));
      }

      if (!body || typeof body !== "object") {
        throw new Error("The server sent a response we couldn't read. Try again.");
      }
      return body;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("This is taking too long. Check your connection and try again.");
      }
      if (err instanceof TypeError) {
        // fetch() throws TypeError when the network or server is unreachable
        throw new Error("Can't reach the server. Make sure it's running, then try again.");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- Rendering ----------
  // Everything below uses textContent (never innerHTML), so text from the
  // AI can't inject HTML into the page.

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderList(container, items, className) {
    container.replaceChildren(...items.map((item) => el("li", className, item)));
  }

  function renderQuestions(container, questions) {
    const items = questions.map((qa) => {
      const details = el("details", "qa");
      details.append(
        el("summary", "", qa.question),
        el("div", "qa-answer", qa.answer)
      );
      return details;
    });
    container.replaceChildren(...items);
  }

  function renderResults(data, values) {
    resultTitle.textContent = values.chapter;
    resultBoard.textContent = values.board;
    resultClass.textContent = `Class ${values.class_level}`;
    resultSubject.textContent = values.subject;

    summaryText.textContent = data.summary;
    renderList(conceptsList, data.key_concepts, "concept");
    renderList(keywordsList, data.formulas_or_keywords, "pill");
    renderQuestions(questionsList, data.practice_questions);

    showState("results");
    scrollToResultsOnSmallScreens(results);
  }

  /** Extra safety check on the response shape before we render it. */
  function looksValid(data) {
    return (
      typeof data.summary === "string" &&
      Array.isArray(data.key_concepts) &&
      Array.isArray(data.formulas_or_keywords) &&
      Array.isArray(data.practice_questions) &&
      data.practice_questions.every((q) => q && q.question && q.answer)
    );
  }

  // ---------- Submit handler ----------

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return; // ignore double submits

    const values = readFormValues();
    const problem = validate(values);
    if (problem) {
      showError(problem);
      return;
    }

    setBusy(true);
    showState("loading");
    scrollToResultsOnSmallScreens(loadingState);

    try {
      const data = await requestNotes(values);
      if (!looksValid(data)) {
        throw new Error("The notes came back incomplete. Try again.");
      }
      renderResults(data, values);
      if (window.Syio) window.Syio.saveNote(values, data); // keeps a copy for "Export all notes"
    } catch (err) {
      showError(err.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  });

  // Start on the empty state
  showState("empty");
})();
