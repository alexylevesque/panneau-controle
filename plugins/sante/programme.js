// Programme d'entraînement « ALEXY_1 » (recopié de FitLog).
// s = séries, r = répétitions, repos = secondes, tempo = cadence. Les lettres (A1, A2…) = supersets comme dans FitLog.
module.exports = {
  nom: 'ALEXY_1',
  jours: [
    { nom: 'Pectoraux et triceps', icone: '💪', exercices: [
      { l: 'A', n: 'Cable Standing Chest Press', s: 3, r: 15, repos: 60 },
      { l: 'B', n: 'Smith Machine Incline Press', s: 4, r: 15, repos: 90 },
      { l: 'C1', n: 'Dumbbell Incline Bench Press', s: 4, r: 12, tempo: '2111' },
      { l: 'C2', n: 'Dumbbell Incline Fly', s: 4, r: 10, repos: 90, tempo: '3121' },
      { l: 'D', n: 'Decline Bench Press', s: 3, r: 12, repos: 90 },
      { l: 'E', n: 'Pec Deck Machine', s: 4, r: 12, repos: 90 },
      { l: 'F', n: 'Cable One Arm Side Triceps', s: 3, r: 15, repos: 60 },
    ] },
    { nom: 'Dos et biceps', icone: '🏋️', exercices: [
      { l: 'A', n: 'Assisted Pull-ups', s: 3, r: 15, repos: 90 },
      { l: 'B1', n: 'Wide Grip Lat Pulldown', s: 4, r: 12 },
      { l: 'B2', n: 'Bent Straight Arm Pulldown', s: 4, r: 12, repos: 180 },
      { l: 'C', n: 'Chest Supported T-Bar Row', s: 4, r: 12, repos: 180 },
      { l: 'D', n: 'Dumbbell One Arm Row', s: 3, r: 12, repos: 90 },
      { l: 'E', n: 'Cable One Arm Biceps Curl', s: 3, r: 15, repos: 60 },
    ] },
    { nom: 'Jambes', icone: '🦵', exercices: [
      { l: 'A1', n: 'Thigh Abductor', s: 3, r: 15 },
      { l: 'A2', n: 'Thigh Adductor', s: 3, r: 15 },
      { l: 'B', n: 'Standing One Leg Curl', s: 4, r: 12, repos: 90 },
      { l: 'C', n: 'Leg Press', s: 4, r: 12, repos: 120 },
      { l: 'D1', n: 'Walking Lunges', s: 4, r: 2 },
      { l: 'D2', n: 'Wall Ball', s: 4, r: 15, repos: 180 },
      { l: 'E', n: 'Leg Extension', s: 3, r: 15, repos: 90 },
      { l: 'F', n: 'Standing Calf Raises', s: 3, r: 10, repos: 90, tempo: '3422' },
    ] },
    { nom: 'Épaules et abdos', icone: '🤸', exercices: [
      { l: 'A1', n: 'Reverse Pec Deck', s: 4, r: 12, tempo: '3221' },
      { l: 'A2', n: 'Barbell Rear Delt Row', s: 4, r: 10, repos: 120 },
      { l: 'B', n: 'Shoulder Press Machine', s: 4, r: 12, repos: 90 },
      { l: 'C', n: 'Seated DB Side Raises', s: 4, r: 12, repos: 90 },
      { l: 'D', n: 'Incline Bench Dumbbell', s: 4, r: 12, repos: 90 },
      { l: 'E1', n: 'Ab Roller', s: 3, r: 10 },
      { l: 'E2', n: 'Russian Twist', s: 3, r: 20, repos: 120 },
    ] },
    { nom: 'Bras', icone: '💪', exercices: [
      { l: 'A', n: 'Alternate Incline Dumbbell Curl', s: 3, r: 25, repos: 90 },
      { l: 'B', n: 'Cable Reverse Grip Pushdown', s: 3, r: 25, repos: 90 },
      { l: 'C', n: 'Alternate Dumbbell Hammer Curl', s: 3, r: 25, repos: 90 },
      { l: 'D', n: 'Barbell Lying Triceps Extension', s: 3, r: 25, repos: 90 },
      { l: 'E', n: 'Incline Lying Dumbbell Biceps Curl', s: 3, r: 20, repos: 90 },
      { l: 'F', n: 'Tricep Dip Machine', s: 3, r: 20, repos: 90 },
    ] },
  ],
};
