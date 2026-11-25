window.NP_PUZZLES = [
  {
    name: "Survey 00", label: "REQUIRED ROOM SURVEY", objective: "Find the hand lamp. Its beam may reveal what the dark is keeping.", artifact: "THE FIRST GATE", fragment: "T",
    hints: ["A small light was left within reach of the writing table.", "Recover the lamp first. Something at the old gate catches its beam.", "The brass key appears only after the lamp is in your inventory. Center it and press E."],
    answer: "SURVEY", type: "survey"
  },
  {
    name: "Exposure Order", label: "PHOTO METADATA / 02", objective: "Order the photographs by their original capture times. Read the result as the next tool to consult.", artifact: "PHOTO STRIP", fragment: "H",
    hints: ["Use DateTimeOriginal, not the filename or the order the files were recovered.", "The timestamps use one local clock and one timezone.", "Arrange the letters in time order. They name a globe-based mapping tool."],
    answer: "EARTH", type: "photo-order"
  },
  {
    name: "The Cryptex", label: "CAMPUS SURVEY / 03", objective: "Find the bull fountain at the Marshall Student Center in Google Earth. Count the details in the survey record's order and enter one count per ring.", artifact: "BRASS CRYPTEX", fragment: "E",
    hints: ["Use the Marshall Student Center plaza's bull fountain, not a different USF bull.", "The five counts are: bulls; red-shirted people beside a bull; yellow signs beside a bull; people in business attire; yellow daffodils.", "Enter each count in that order. The final category may contribute a zero."],
    answer: "31210", type: "cryptex"
  },
  {
    name: "The Blind Side", label: "EARTH IMAGE / 04", objective: "Compare the mirror's reflected campus view with the recovered Google Earth captures. Find the frame that matches the reflected landmarks, then read its camera bearing.", artifact: "MIRROR PLATE", fragment: "G",
    hints: ["The reflection shows a straight north-south road beside a long, narrow lake.", "Match the lake and road arrangement in the Google Earth reference. The correct capture has the same view direction as the mirror.", "Choose the frame with Lake Behnke west of the north-south road; read the bearing in its metadata."],
    answer: "000", type: "earth-mirror"
  },
  {
    name: "Signal 05", label: "LIGHT TRANSMISSION / 05", objective: "Decode the lamp's short and long flashes. This is the only Morse puzzle.", artifact: "SIGNAL LAMP", fragment: "A",
    hints: ["Read each group as a letter; short is a dot and long is a dash.", "The groups are .-- / . / ... / -.", "The four letters name a direction."],
    answer: "WEST", type: "morse"
  },
  {
    name: "Negative Archive", label: "IMAGE METADATA / 06", objective: "Inspect the six recovered photographs. Put them in capture-time order, then read the final character of each camera note.", artifact: "PHOTO NEGATIVES", fragment: "T",
    hints: ["Open each metadata card. DateTimeOriginal is the reliable field for ordering the photographs.", "The camera notes contain decoys and one useful last character each. Read those characters from earliest to latest.", "The recovered word tells the operator what to do."],
    answer: "RETURN", type: "metadata-photos"
  },
  {
    name: "UTC Offset", label: "EARTH FIX / 07", objective: "Use Google Earth to verify the camera's location. Then reconstruct the photograph's absolute capture time from its metadata.", artifact: "SURVEY PHOTOGRAPH", fragment: "E",
    hints: ["The GPS pin is at the USF Tampa campus. The photograph's metadata is in the Exposure Order record.", "DateTimeOriginal is 1998:12:24 22:41:12, recorded in UTC−05:00. Convert that local time to UTC; the date rolls over.", "Enter the UTC instant as YYYYMMDDHHMMSS, with no spaces or punctuation."],
    answer: "19981225034112", type: "earth"
  },
  {
    name: "The Shadow Index", label: "LAMP ALIGNMENT / 08", objective: "Turn the inspection lamp until the object's shadow crosses the etched line.", artifact: "SHADOW RELIEF", fragment: "I",
    hints: ["The etched line is fixed; rotate only the lamp.", "Move in 15-degree increments and watch for the shadow to bisect the mark.", "At 90 degrees the alignment reveals 1218."],
    answer: "1218", type: "shadow"
  },
  {
    name: "Route Memory", label: "SIGHTLINE RECONSTRUCTION / 09", objective: "Rebuild the only route compatible with the chamber's sightlines.", artifact: "FLOOR PLAN", fragment: "S",
    hints: ["Start at A and use each station exactly once before returning.", "E is last. C is before D, D before B, and B cannot follow A directly.", "The route is A → C → D → B → E. Enter the five middle stations."],
    answer: "ACDBE", type: "route"
  },
  {
    name: "Continuity", label: "FINAL RECONSTRUCTION / 10", objective: "Read the recovered fragments in order. Complete the sentence and open the gate.", artifact: "CONTINUITY GATE", fragment: "INSIDE",
    hints: ["The fragments read THE GATE IS …", "The map places the gate outside. The photographs place the camera inside.", "The final word is INSIDE."],
    answer: "INSIDE", type: "final"
  }
];

