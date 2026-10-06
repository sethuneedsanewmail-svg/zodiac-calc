import { google } from "googleapis";

const S = {
  products: "Products",
  items: "Voucher_Items",
  history: "Voucher_History",
  confirmed: "Confirmed_Orders",
  confirmedItems: "Confirmed_Order_Items"
};

function sid() {
  return process.env.SPREADSHEET_ID || "";
}

function auth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON.");
  }

  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets"
    ]
  });
}

function sheets() {
  return google.sheets({
    version: "v4",
    auth: auth()
  });
}

async function vals(range, options = {}) {
  const result = await sheets().spreadsheets.values.get({
    spreadsheetId: sid(),
    range,
    ...options
  });

  return result.data.values || [];
}

async function append(range, row) {
  await sheets().spreadsheets.values.append({
    spreadsheetId: sid(),
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [row]
    }
  });
}

async function replace(range, rows) {
  await sheets().spreadsheets.values.clear({
    spreadsheetId: sid(),
    range,
    requestBody: {}
  });

  if (!rows.length) {
    return;
  }

  await sheets().spreadsheets.values.update({
    spreadsheetId: sid(),
    range: range.split(":")[0],
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: rows
    }
  });
}

function res(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store"
      }
    }
  );
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function parsePrice(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  const number = parseFloat(cleaned);

  return Number.isFinite(number) ? number : 0;
}

function makeVoucherNumber(date, number) {
  return (
    `V-${date.replaceAll("-", "")}-` +
    `${String(number).padStart(3, "0")}`
  );
}

async function nextVoucherNumber(date) {
  const history = await vals(
    `${S.history}!A2:G`
  );

  const numbers = history
    .filter(row => dateOnly(row[2]) === date)
    .map(row => {
      const match = String(row[0] || "").match(/-(\d+)$/);
      return Number(match?.[1] || 0);
    });

  const nextNumber =
    (numbers.length ? Math.max(...numbers) : 0) + 1;

  return makeVoucherNumber(date, nextNumber);
}

async function getVoucher(voucherNo) {
  const history = await vals(
    `${S.history}!A2:G`
  );

  const row = history.find(
    item => item[0] === voucherNo
  );

  if (!row) {
    throw new Error("Voucher not found.");
  }

  const items = await vals(
    `${S.items}!A2:H`
  );

  return {
    voucherNo,
    clientName: row[1] || "",
    date: dateOnly(row[2]),
    total: parsePrice(row[3]),
    status: row[4] || "Pending",
    statusDate: row[5] || "",

    items: items
      .filter(item => item[0] === voucherNo)
      .map(item => ({
        productId: item[3],
        description: item[4],
        quantity: Number(item[5] || 0),
        unitPrice: parsePrice(item[6]),
        lineTotal: parsePrice(item[7])
      }))
  };
}

/* =========================================================
   CREATE VOUCHER
========================================================= */

async function createVoucher(body) {
  const clientName =
    String(body.clientName || "").trim();

  const date =
    dateOnly(body.date);

  const items =
    Array.isArray(body.items)
      ? body.items
      : [];

  if (!clientName) {
    throw new Error("Client name is required.");
  }

  if (!date) {
    throw new Error("Date is required.");
  }

  if (!items.length) {
    throw new Error(
      "At least one product is required."
    );
  }

  const voucherNo =
    await nextVoucherNumber(date);

  let total = 0;

  const cleanedItems = items.map(item => {
    const productId =
      String(item.productId || "").trim();

    const description =
      String(item.description || "").trim();

    const quantity =
      Number(item.quantity || 0);

    const unitPrice =
      parsePrice(item.unitPrice);

    if (!productId) {
      throw new Error(
        "Every item must have a product."
      );
    }

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      throw new Error(
        "Quantity must be greater than zero."
      );
    }

    if (
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      throw new Error(
        "Invalid product price."
      );
    }

    const lineTotal =
      quantity * unitPrice;

    total += lineTotal;

    return [
      voucherNo,
      clientName,
      date,
      productId,
      description,
      quantity,
      unitPrice,
      lineTotal
    ];
  });

  await append(
    `${S.history}!A2:G`,
    [
      voucherNo,
      clientName,
      date,
      total,
      "Pending",
      "",
      ""
    ]
  );

  for (const row of cleanedItems) {
    await append(
      `${S.items}!A2:H`,
      row
    );
  }

  return {
    ok: true,
    voucherNo,
    total
  };
}

/* =========================================================
   UPDATE VOUCHER
========================================================= */

async function updateVoucher(body) {
  const voucherNo =
    String(body.voucherNo || "").trim();

  const clientName =
    String(body.clientName || "").trim();

  const date =
    dateOnly(body.date);

  const items =
    Array.isArray(body.items)
      ? body.items
      : [];

  if (!voucherNo) {
    throw new Error(
      "Voucher number is required."
    );
  }

  if (!clientName) {
    throw new Error(
      "Client name is required."
    );
  }

  if (!date) {
    throw new Error(
      "Date is required."
    );
  }

  if (!items.length) {
    throw new Error(
      "At least one product is required."
    );
  }

  const history =
    await vals(
      `${S.history}!A2:G`
    );

  const historyIndex =
    history.findIndex(
      row => row[0] === voucherNo
    );

  if (historyIndex === -1) {
    throw new Error(
      "Voucher not found."
    );
  }

  const oldRow =
    history[historyIndex];

  const status =
    String(
      oldRow[4] || "Pending"
    ).trim();

  if (status !== "Pending") {
    throw new Error(
      "Only Pending vouchers can be edited."
    );
  }

  let total = 0;

  const cleanedItems =
    items.map(item => {
      const productId =
        String(
          item.productId || ""
        ).trim();

      const description =
        String(
          item.description || ""
        ).trim();

      const quantity =
        Number(
          item.quantity || 0
        );

      const unitPrice =
        parsePrice(
          item.unitPrice
        );

      if (!productId) {
        throw new Error(
          "Every item must have a product."
        );
      }

      if (
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        throw new Error(
          "Quantity must be greater than zero."
        );
      }

      if (
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      ) {
        throw new Error(
          "Invalid product price."
        );
      }

      const lineTotal =
        quantity * unitPrice;

      total += lineTotal;

      return [
        voucherNo,
        clientName,
        date,
        productId,
        description,
        quantity,
        unitPrice,
        lineTotal
      ];
    });

  history[historyIndex] = [
    voucherNo,
    clientName,
    date,
    total,
    "Pending",
    oldRow[5] || "",
    oldRow[6] || ""
  ];

  await replace(
    `${S.history}!A2:G`,
    history
  );

  const existingItems =
    await vals(
      `${S.items}!A2:H`
    );

  const remainingItems =
    existingItems.filter(
      row => row[0] !== voucherNo
    );

  const finalItems = [
    ...remainingItems,
    ...cleanedItems
  ];

  await replace(
    `${S.items}!A2:H`,
    finalItems
  );

  return {
    ok: true,
    voucherNo,
    total
  };
}

/* =========================================================
   UPDATE STATUS
========================================================= */

async function updateStatus(
  voucherNo,
  newStatus
) {
  const history =
    await vals(
      `${S.history}!A2:G`
    );

  const index =
    history.findIndex(
      row => row[0] === voucherNo
    );

  if (index === -1) {
    throw new Error(
      "Voucher not found."
    );
  }

  const row =
    history[index];

  row[4] =
    newStatus;

  row[5] =
    new Date().toISOString();

  await sheets()
    .spreadsheets
    .values
    .update({
      spreadsheetId: sid(),
      range:
        `${S.history}!A${index + 2}:G${index + 2}`,
      valueInputOption:
        "USER_ENTERED",
      requestBody: {
        values: [row]
      }
    });

  return row;
}

/* =========================================================
   CONFIRM
========================================================= */

async function confirmVoucher(voucherNo) {
  const voucher =
    await getVoucher(voucherNo);

  if (
    voucher.status ===
    "Confirmed"
  ) {
    return {
      ok: true,
      alreadyConfirmed: true
    };
  }

  if (
    voucher.status ===
    "Cancelled"
  ) {
    throw new Error(
      "Cancelled vouchers cannot be confirmed."
    );
  }

  await updateStatus(
    voucherNo,
    "Confirmed"
  );

  const confirmed =
    await vals(
      `${S.confirmed}!A2:F`
    );

  const alreadyExists =
    confirmed.some(
      row => row[0] === voucherNo
    );

  if (!alreadyExists) {
    await append(
      `${S.confirmed}!A2:F`,
      [
        voucher.voucherNo,
        voucher.clientName,
        voucher.date,
        voucher.total,
        "Confirmed",
        new Date().toISOString()
      ]
    );
  }

  const confirmedItems =
    await vals(
      `${S.confirmedItems}!A2:H`
    );

  const itemsExist =
    confirmedItems.some(
      row => row[0] === voucherNo
    );

  if (!itemsExist) {
    for (const item of voucher.items) {
      await append(
        `${S.confirmedItems}!A2:H`,
        [
          voucher.voucherNo,
          voucher.clientName,
          voucher.date,
          item.productId,
          item.description,
          item.quantity,
          item.unitPrice,
          item.lineTotal
        ]
      );
    }
  }

  return {
    ok: true
  };
}

/* =========================================================
   CANCEL
========================================================= */

async function cancelVoucher(voucherNo) {
  const voucher =
    await getVoucher(voucherNo);

  if (
    voucher.status ===
    "Cancelled"
  ) {
    return {
      ok: true,
      alreadyCancelled: true
    };
  }

  if (
    voucher.status ===
    "Confirmed"
  ) {
    throw new Error(
      "Confirmed vouchers cannot be cancelled."
    );
  }

  await updateStatus(
    voucherNo,
    "Cancelled"
  );

  return {
    ok: true
  };
}

/* =========================================================
   DELETE
========================================================= */

async function deleteVoucher(voucherNo) {
  const items =
    await vals(
      `${S.items}!A2:H`
    );

  const history =
    await vals(
      `${S.history}!A2:G`
    );

  const confirmed =
    await vals(
      `${S.confirmed}!A2:F`
    );

  const confirmedItems =
    await vals(
      `${S.confirmedItems}!A2:H`
    );

  await replace(
    `${S.items}!A2:H`,
    items.filter(
      row => row[0] !== voucherNo
    )
  );

  await replace(
    `${S.history}!A2:G`,
    history.filter(
      row => row[0] !== voucherNo
    )
  );

  await replace(
    `${S.confirmed}!A2:F`,
    confirmed.filter(
      row => row[0] !== voucherNo
    )
  );

  await replace(
    `${S.confirmedItems}!A2:H`,
    confirmedItems.filter(
      row => row[0] !== voucherNo
    )
  );

  return {
    ok: true
  };
}

/* =========================================================
   PRODUCTS
========================================================= */

async function getProducts() {
  const rows =
    await vals(
      `${S.products}!A2:H`,
      {
        valueRenderOption:
          "FORMATTED_VALUE"
      }
    );

  const products =
    rows
      .filter(row => {
        const active =
          String(
            row[7] ?? ""
          )
            .trim()
            .toLowerCase();

        return (
          active !== "false" &&
          active !== "no"
        );
      })
      .map(row => ({
        id: row[0],
        description: row[2],
        price: parsePrice(row[3])
      }));

  return products;
}

/* =========================================================
   HISTORY
========================================================= */

async function getHistory() {
  return await vals(
    `${S.history}!A2:G`
  );
}

/* =========================================================
   RESET
========================================================= */

async function resetToday(date) {
  const history =
    await vals(
      `${S.history}!A2:G`
    );

  const hasToday =
    history.some(
      row =>
        dateOnly(row[2]) ===
        date
    );

  if (hasToday) {
    throw new Error(
      "Cannot reset: vouchers already exist for today."
    );
  }

  return {
    ok: true
  };
}

/* =========================================================
   MAIN HANDLER
========================================================= */

export default async function handler(req) {
  try {
    const url =
      new URL(req.url);

    if (
      req.method ===
      "OPTIONS"
    ) {
      return new Response(
        "",
        {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods":
              "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type"
          }
        }
      );
    }

    /* PRODUCTS */

    if (
      req.method === "GET" &&
      url.pathname.endsWith("/products")
    ) {
      return res({
        products:
          await getProducts()
      });
    }

    /* HISTORY */

    if (
      req.method === "GET" &&
      url.pathname.endsWith("/history")
    ) {
      return res({
        rows:
          await getHistory()
      });
    }

    /* VOUCHERS GET */

    if (
      req.method === "GET" &&
      url.pathname.endsWith("/vouchers")
    ) {
      const mode =
        url.searchParams.get("mode");

      if (mode === "next") {
        const date =
          url.searchParams.get("date") ||
          new Date()
            .toISOString()
            .slice(0, 10);

        return res({
          voucherNo:
            await nextVoucherNumber(
              date
            )
        });
      }

      if (mode === "get") {
        const voucherNo =
          url.searchParams.get(
            "voucherNo"
          );

        if (!voucherNo) {
          throw new Error(
            "Voucher number is required."
          );
        }

        return res({
          voucher:
            await getVoucher(
              voucherNo
            )
        });
      }
    }

    /* VOUCHERS POST */

    if (
      req.method === "POST" &&
      url.pathname.endsWith("/vouchers")
    ) {
      const body =
        await req.json();

      if (
        body.action ===
        "update"
      ) {
        return res(
          await updateVoucher(
            body
          )
        );
      }

      if (
        body.action ===
        "confirm"
      ) {
        if (!body.voucherNo) {
          throw new Error(
            "Voucher number is required."
          );
        }

        return res(
          await confirmVoucher(
            body.voucherNo
          )
        );
      }

      if (
        body.action ===
        "cancel"
      ) {
        if (!body.voucherNo) {
          throw new Error(
            "Voucher number is required."
          );
        }

        return res(
          await cancelVoucher(
            body.voucherNo
          )
        );
      }

      if (
        body.action ===
        "delete"
      ) {
        if (!body.voucherNo) {
          throw new Error(
            "Voucher number is required."
          );
        }

        return res(
          await deleteVoucher(
            body.voucherNo
          )
        );
      }

      if (
        body.action ===
        "reset"
      ) {
        return res(
          await resetToday(
            body.date
          )
        );
      }

      return res(
        await createVoucher(
          body
        )
      );
    }

    return res(
      {
        error: "Not found"
      },
      404
    );

  } catch (error) {
    console.error(
      "Voucher Manager API error:",
      error
    );

    return res(
      {
        error:
          error.message ||
          String(error)
      },
      500
    );
  }
}

export const config = {
  path: "/api/*"
};
