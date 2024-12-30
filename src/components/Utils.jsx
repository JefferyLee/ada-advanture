export const updateHighScores = (newScore, currentHighScores) => {

    console.log("update HighScores.")

    if (!Array.isArray(currentHighScores)) {
        currentHighScores = [];
    }

    currentHighScores.push(newScore);
    currentHighScores.sort((a, b) => b - a);

    return currentHighScores.slice(0, 10);
};

export default updateHighScores;