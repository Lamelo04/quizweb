"use strict";

const QUESTION_TIME = 20;
const POINTS_PER_QUESTION = 100;
const TIME_PENALTY_PER_SECOND = 5;
const HIGH_SCORES_KEY = "quizweb-high-scores-v1";

const demoQuestions = [
  {
    category: "HTML",
    type: "multiple_choice",
    question: "Quelle balise HTML sert à créer un lien vers une autre page ?",
    answers: ["<link>", "<a>", "<href>", "<url>"],
    correct: 1,
    explanation: "La balise <a> (pour « anchor ») crée un lien. Son attribut href indique sa destination."
  },
  {
    category: "CSS",
    type: "multiple_choice",
    question: "Quelle propriété CSS change la couleur du texte ?",
    answers: ["text-color", "font-style", "color", "background-color"],
    correct: 2,
    explanation: "La propriété color définit la couleur du texte. background-color, elle, colore l'arrière-plan."
  },
  {
    category: "JavaScript",
    type: "true_false",
    question: "JavaScript peut modifier le contenu d'une page sans la recharger.",
    answers: ["Vrai", "Faux"],
    correct: 0,
    explanation: "Vrai. JavaScript peut modifier les éléments du DOM directement dans le navigateur."
  },
  {
    category: "HTML",
    type: "true_false",
    question: "L'attribut alt d'une image aide les lecteurs d'écran à la décrire.",
    answers: ["Vrai", "Faux"],
    correct: 0,
    explanation: "Vrai. Un texte alternatif décrit l'image lorsque celle-ci n'est pas visible ou chargée."
  },
  {
    category: "JavaScript",
    type: "multiple_choice",
    question: "Quel mot-clé déclare une variable dont la valeur peut changer ?",
    answers: ["const", "let", "static", "fixed"],
    correct: 1,
    explanation: "let déclare une variable réassignable. const est utilisé quand on ne réassigne pas la variable."
  }
];

const welcomeScreen = document.querySelector(".welcome-screen");
const quizScreen = document.getElementById("quiz");
const resultScreen = document.getElementById("result");
const generateButton = document.getElementById("generate-button");
const demoButton = document.getElementById("demo-button");
const restartButton = document.getElementById("restart-button");
const homeButton = document.getElementById("home-button");
const topicInput = document.getElementById("topic-input");
const questionCountInput = document.getElementById("question-count");
const questionTypeInput = document.getElementById("question-type");
const difficultyInput = document.getElementById("difficulty");
const setupMessage = document.getElementById("setup-message");
const questionNumber = document.getElementById("question-number");
const questionTotal = document.getElementById("question-total");
const progressTrack = document.querySelector(".progress-track");
const progressFill = document.getElementById("progress-fill");
const questionKind = document.getElementById("question-kind");
const timerCountdown = document.getElementById("timer-countdown");
const timerTrack = document.getElementById("timer-track");
const timerFill = document.getElementById("timer-fill");
const questionCategory = document.getElementById("question-category");
const questionCard = document.getElementById("question-card");
const questionTitle = document.getElementById("question-title");
const answersContainer = document.getElementById("answers");
const feedback = document.getElementById("feedback");
const nextButton = document.getElementById("next-button");
const scoreValue = document.getElementById("score-value");
const scoreCaption = document.getElementById("score-caption");
const resultTitle = document.getElementById("result-title");
const resultMessage = document.getElementById("result-message");
const resultProgressFill = document.getElementById("result-progress-fill");
const resultIcon = document.getElementById("result-icon");

let currentQuestions = [];
let currentQuestion = 0;
let score = 0;
let correctCount = 0;
let hasAnswered = false;
let timerId = null;
let questionStartedAt = 0;
let timeRemaining = QUESTION_TIME;

renderHighScores();

function showScreen(screenToShow) {
  [welcomeScreen, quizScreen, resultScreen].forEach((screen) => screen.classList.add("hidden"));
  screenToShow.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showSetupMessage(message, isError = false) {
  setupMessage.textContent = message;
  setupMessage.className = message
    ? `setup-message${isError ? " setup-error" : ""}`
    : "setup-message hidden";
}

async function generateQuiz() {
  const topic = topicInput.value.trim();
  if (!topic) {
    showSetupMessage("Saisissez un sujet pour générer les questions.", true);
    topicInput.focus();
    return;
  }

  generateButton.disabled = true;
  demoButton.disabled = true;
  showSetupMessage("Génération des questions en cours…");

  try {
    const response = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        count: Number(questionCountInput.value),
        type: questionTypeInput.value,
        difficulty: difficultyInput.value
      })
    });
    const responseText = await response.text();
    let data;
    try {
      data = responseText.trim() ? JSON.parse(responseText) : null;
    } catch {
      data = null;
    }
    if (!data) {
      throw new Error(
        `Le serveur n'a pas renvoyé de réponse JSON (HTTP ${response.status}). Lancez le projet avec npm start et ouvrez http://localhost:3000, pas avec Live Server.`
      );
    }
    if (!response.ok) throw new Error(data.error || "La génération a échoué.");
    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error("L'API n'a pas renvoyé de questions valides.");
    }
    showSetupMessage("");
    startQuiz(data.questions);
  } catch (error) {
    const message = error instanceof TypeError || /fetch|network|failed to parse url/i.test(error.message)
      ? "Démarrez le projet avec npm start, puis ouvrez http://localhost:3000."
      : error.message;
    showSetupMessage(message, true);
  } finally {
    generateButton.disabled = false;
    demoButton.disabled = false;
  }
}

function startQuiz(questionSet) {
  stopTimer();
  currentQuestions = questionSet.map((question) => ({ ...question, answers: [...question.answers] }));
  currentQuestion = 0;
  score = 0;
  correctCount = 0;
  hasAnswered = false;
  questionTotal.textContent = String(currentQuestions.length).padStart(2, "0");
  progressTrack.setAttribute("aria-valuemax", String(currentQuestions.length));
  showScreen(quizScreen);
  renderQuestion();
  window.setTimeout(() => questionTitle.focus(), 50);
}

function renderQuestion() {
  const item = currentQuestions[currentQuestion];
  hasAnswered = false;
  questionNumber.textContent = String(currentQuestion + 1).padStart(2, "0");
  questionCategory.textContent = item.category || "Quiz";
  questionTitle.textContent = item.question;
  questionKind.textContent = item.type === "true_false" ? "Vrai / Faux" : "QCM";
  progressFill.style.width = `${((currentQuestion + 1) / currentQuestions.length) * 100}%`;
  progressTrack.setAttribute("aria-valuenow", String(currentQuestion + 1));
  answersContainer.replaceChildren();
  feedback.className = "feedback hidden";
  feedback.replaceChildren();
  nextButton.disabled = true;
  nextButton.innerHTML = currentQuestion === currentQuestions.length - 1
    ? 'Voir mon résultat <span aria-hidden="true">→</span>'
    : 'Suivant <span aria-hidden="true">→</span>';

  questionCard.classList.remove("question-enter");
  void questionCard.offsetWidth;
  questionCard.classList.add("question-enter");

  item.answers.forEach((answer, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-option";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `Réponse ${String.fromCharCode(65 + index)} : ${answer}`);

    const letter = document.createElement("span");
    letter.className = "answer-letter";
    letter.setAttribute("aria-hidden", "true");
    letter.textContent = String.fromCharCode(65 + index);

    const text = document.createElement("span");
    text.className = "answer-text";
    text.textContent = answer;

    const marker = document.createElement("span");
    marker.className = "answer-check";
    marker.setAttribute("aria-hidden", "true");

    button.append(letter, text, marker);
    button.addEventListener("click", () => selectAnswer(index));
    answersContainer.append(button);
  });

  startTimer();
}

function startTimer() {
  stopTimer();
  questionStartedAt = Date.now();
  timeRemaining = QUESTION_TIME;
  updateTimerDisplay();

  timerId = window.setInterval(() => {
    timeRemaining = Math.max(0, Math.ceil((QUESTION_TIME * 1000 - (Date.now() - questionStartedAt)) / 1000));
    updateTimerDisplay();
    if (timeRemaining === 0) selectAnswer(null, true);
  }, 200);
}

function stopTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function updateTimerDisplay() {
  timerCountdown.textContent = `${timeRemaining} s`;
  timerTrack.setAttribute("aria-valuenow", String(timeRemaining));
  timerFill.style.width = `${(timeRemaining / QUESTION_TIME) * 100}%`;
  timerTrack.classList.toggle("timer-low", timeRemaining <= 5);
  timerCountdown.classList.toggle("timer-text-low", timeRemaining <= 5);
}

function selectAnswer(selectedIndex, timedOut = false) {
  if (hasAnswered) return;
  hasAnswered = true;
  stopTimer();

  const item = currentQuestions[currentQuestion];
  const isCorrect = !timedOut && selectedIndex === item.correct;
  let pointsEarned = 0;
  if (isCorrect) {
    correctCount += 1;
    const elapsedSeconds = Math.floor((Date.now() - questionStartedAt) / 1000);
    pointsEarned = Math.max(10, POINTS_PER_QUESTION - elapsedSeconds * TIME_PENALTY_PER_SECOND);
    score += pointsEarned;
  }

  answersContainer.querySelectorAll(".answer-option").forEach((button, index) => {
    button.disabled = true;
    const marker = button.querySelector(".answer-check");
    if (index === item.correct) {
      button.classList.add("correct");
      marker.textContent = "✓";
    } else if (!timedOut && index === selectedIndex) {
      button.classList.add("incorrect");
      marker.textContent = "×";
    }
  });

  feedback.className = `feedback ${isCorrect ? "correct-feedback" : "incorrect-feedback"}`;
  const heading = document.createElement("strong");
  if (timedOut) heading.textContent = "Temps écoulé !";
  else if (isCorrect) heading.textContent = `Bonne réponse ! +${pointsEarned} points`;
  else heading.textContent = "Pas tout à fait !";
  feedback.replaceChildren(heading, document.createTextNode(item.explanation));
  nextButton.disabled = false;
  nextButton.focus();
}

function getHighScores() {
  try {
    const saved = JSON.parse(localStorage.getItem(HIGH_SCORES_KEY) || "[]");
    return Array.isArray(saved)
      ? saved.filter((entry) => entry && Number.isFinite(entry.score) && Number.isFinite(entry.correct) && Number.isFinite(entry.total))
      : [];
  } catch {
    return [];
  }
}

function saveHighScore() {
  const scores = getHighScores();
  scores.push({
    score,
    correct: correctCount,
    total: currentQuestions.length,
    date: new Date().toISOString()
  });
  scores.sort((a, b) => b.score - a.score || b.correct - a.correct);
  try {
    localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(scores.slice(0, 5)));
  } catch {
    // The quiz still works when browser storage is unavailable.
  }
  renderHighScores();
}

function renderHighScores() {
  const scores = getHighScores();
  renderScoreList(document.getElementById("high-scores-list"), scores);
  renderScoreList(document.getElementById("result-high-scores-list"), scores);
}

function renderScoreList(list, scores) {
  list.replaceChildren();
  if (scores.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Vos résultats apparaîtront ici.";
    list.append(empty);
    return;
  }

  scores.forEach((entry) => {
    const row = document.createElement("li");
    const result = document.createElement("span");
    result.textContent = `${entry.score} pts · ${entry.correct}/${entry.total} bonnes réponses`;
    const date = document.createElement("time");
    if (entry.date) {
      date.dateTime = entry.date;
      date.textContent = new Date(entry.date).toLocaleDateString("fr-FR");
    }
    row.append(result, date);
    list.append(row);
  });
}

function showResults() {
  stopTimer();
  saveHighScore();
  showScreen(resultScreen);
  scoreValue.textContent = String(score);
  scoreCaption.textContent = `${correctCount} / ${currentQuestions.length} bonnes réponses`;
  resultProgressFill.style.width = `${(correctCount / currentQuestions.length) * 100}%`;
  resultIcon.textContent = correctCount === currentQuestions.length ? "★" : correctCount === 0 ? "✿" : "✦";

  if (correctCount === currentQuestions.length) {
    resultTitle.textContent = "Incroyable !";
    resultMessage.textContent = "Le web n'a presque plus de secrets pour vous.";
  } else if (correctCount >= Math.ceil(currentQuestions.length * 0.6)) {
    resultTitle.textContent = "Bien joué !";
    resultMessage.textContent = "Vous avez de solides bases. Continuez comme ça !";
  } else if (correctCount > 0) {
    resultTitle.textContent = "Joli début !";
    resultMessage.textContent = "Chaque réponse est une occasion d'apprendre.";
  } else {
    resultTitle.textContent = "On recommence ?";
    resultMessage.textContent = "Le meilleur moyen d'apprendre, c'est de pratiquer !";
  }
  window.setTimeout(() => restartButton.focus(), 50);
}

function returnToWelcome() {
  stopTimer();
  currentQuestions = [];
  score = 0;
  correctCount = 0;
  hasAnswered = false;
  renderHighScores();
  showScreen(welcomeScreen);
}

generateButton.addEventListener("click", generateQuiz);
demoButton.addEventListener("click", () => startQuiz(demoQuestions));
restartButton.addEventListener("click", () => startQuiz(currentQuestions));
homeButton.addEventListener("click", returnToWelcome);
nextButton.addEventListener("click", () => {
  if (!hasAnswered) return;
  if (currentQuestion < currentQuestions.length - 1) {
    currentQuestion += 1;
    renderQuestion();
    questionTitle.focus();
  } else {
    showResults();
  }
});

