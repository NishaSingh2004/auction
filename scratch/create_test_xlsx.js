const XLSX = require('xlsx');
const path = require('path');

const data = [
    ["Player Name", "Player_Role", "Price", "Age", "Team", "Country"],
    ["K L Rahul", "Batsman", "1200000", "32", "Franchise A", "India"],
    ["Hardik Pandya", "All-Rounder", "1500000", "30", "Franchise B", "India"],
    ["Jasprit Bumrah", "Bowler", "1800000", "30", "Franchise A", "India"]
];

const worksheet = XLSX.utils.aoa_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Players");

const filePath = path.join(__dirname, 'verification_players.xlsx');
XLSX.writeFile(workbook, filePath);
console.log('Test Excel file created at:', filePath);
