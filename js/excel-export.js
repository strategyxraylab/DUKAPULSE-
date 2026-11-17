/*
  DUKAPULSE Excel Business Report
  Generates a multi-sheet Excel workbook from the signed-in business data.
*/

(() => {
  "use strict";

  const button = document.getElementById("settings-excel-export-button");
  const message = document.getElementById("settings-excel-export-message");

  if (!button || !message) return;

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("is-error", isError);
  }

  function addSheet(workbook, name, rows) {
    const data = rows.length ? rows : [{ Notice: "No records available." }];
    const sheet = XLSX.utils.json_to_sheet(data);

    const headers = Object.keys(data[0]);
    sheet["!cols"] = headers.map(header => ({
      wch: Math.min(Math.max(header.length + 5, 15), 35)
    }));

    if (headers.length) {
      sheet["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: data.length, c: headers.length - 1 }
        })
      };
    }

    sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }

  button.addEventListener("click", async () => {
    if (!supabaseClient || !currentUser?.id ||
        !currentBusinessRecord?.id) {
      showMessage("Please sign in and wait for your business dashboard to load.", true);
      return;
    }

    if (typeof fetchAllRows !== "function") {
      showMessage("The business data service is unavailable.", true);
      return;
    }

    if (!window.XLSX) {
      showMessage("Excel export library could not load. Check your internet connection.", true);
      return;
    }

    button.disabled = true;
    showMessage("Preparing your Excel business report…");

    try {
      const businessId = currentBusinessRecord.id;
      const tables = [
        "products",
        "sales",
        "expenses",
        "debts",
        "debt_payments"
      ];

      const exported = {};

      for (const table of tables) {
        exported[table] = await fetchAllRows(() =>
          supabaseClient.from(table)
            .select("*")
            .eq("business_id", businessId)
            .order("id", { ascending: true })
        );
      }

      exported.sale_items = [];
      const saleIds = exported.sales.map(sale => sale.id).filter(Boolean);

      for (let index = 0; index < saleIds.length; index += 100) {
        const batchIds = saleIds.slice(index, index + 100);

        const batch = await fetchAllRows(() =>
          supabaseClient.from("sale_items")
            .select("*")
            .in("sale_id", batchIds)
            .order("id", { ascending: true })
        );

        exported.sale_items.push(...batch);
      }

      const workbook = XLSX.utils.book_new();
      const exportedAt = new Date().toLocaleString();

      const overview = [
        { Field: "Application", Value: "DUKAPULSE" },
        { Field: "Business", Value: currentBusinessRecord.business_name || "" },
        { Field: "Currency", Value: currentBusinessRecord.currency_code || "KES" },
        { Field: "Report generated", Value: exportedAt },
        { Field: "Products", Value: exported.products.length },
        { Field: "Sales", Value: exported.sales.length },
        { Field: "Sale items", Value: exported.sale_items.length },
        { Field: "Expenses", Value: exported.expenses.length },
        { Field: "Debts", Value: exported.debts.length },
        { Field: "Debt payments", Value: exported.debt_payments.length }
      ];

      addSheet(workbook, "Business Overview", overview);
      addSheet(workbook, "Products", exported.products);
      addSheet(workbook, "Sales", exported.sales);
      addSheet(workbook, "Sale Items", exported.sale_items);
      addSheet(workbook, "Expenses", exported.expenses);
      addSheet(workbook, "Debts", exported.debts);
      addSheet(workbook, "Debt Payments", exported.debt_payments);

      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `dukapulse-business-report-${date}.xlsx`);

      showMessage("Your Excel business report has been downloaded successfully.");
    } catch (error) {
      console.error("Excel business report failed:", error);
      showMessage(
        "Excel export failed: " + (error.message || "Please try again."),
        true
      );
    } finally {
      button.disabled = false;
    }
  });
})();
