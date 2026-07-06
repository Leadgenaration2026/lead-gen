/**
 * CSV Template Generator
 * Creates a sample CSV template with all required columns for lead import
 */

export function generateCSVTemplate(): string {
  const headers = [
    "Company Name",
    "First Name",
    "Last Name",
    "Job Title",
    "Email 1",
    "Email 2",
    "Email 3",
    "Phone 1 (C=Cell, L=Landline)",
    "Phone 2 (C=Cell, L=Landline)",
    "Phone 3 (C=Cell, L=Landline)",
    "Industry",
    "Employee Size",
    "Website",
    "LinkedIn URL",
    "Instagram URL",
    "Facebook URL",
    "City",
    "State",
    "Country",
  ];

  // Sample data row
  const sampleRow = [
    "Acme Corporation",
    "John",
    "Doe",
    "Sales Manager",
    "john@acme.com",
    "john.doe@acme.com",
    "",
    "C: (555) 123-4567",
    "L: (555) 987-6543",
    "",
    "Technology",
    "50-100",
    "https://acme.com",
    "https://linkedin.com/in/johndoe",
    "https://instagram.com/acme",
    "https://facebook.com/acme",
    "San Francisco",
    "California",
    "United States",
  ];

  // Create CSV content
  const csvContent = [
    headers.join(","),
    sampleRow.map(cell => `"${cell}"`).join(","),
  ].join("\n");

  return csvContent;
}

export function downloadCSVTemplate(): void {
  const csvContent = generateCSVTemplate();
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", "lead-template.csv");
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
