const XLSX = require('xlsx');
const path = require('path');

const data = [
    ["Player Name", "Category", "Price", "Age", "Team", "Country"],
    ["Shikhar Dhawan", "Batsman", "1000000", "38", "Franchise B", "India"],
    ["Mohammed Shami", "", "1500000", "33", "Franchise A", "India"],  // Role is missing, should default to "Player"
    ["Yuzvendra Chahal", "Bowler", "", "33", "", "India"]  // Price is missing, should default to 0
];

const worksheet = XLSX.utils.aoa_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Players");

const filePath = path.join(__dirname, 'flexible_players.xlsx');
XLSX.writeFile(workbook, filePath);
console.log('Flexible Test Excel file created at:', filePath);
