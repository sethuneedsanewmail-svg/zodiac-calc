import { google } from "googleapis";


/* =========================================================
   GOOGLE SHEET CONFIG
========================================================= */

const S = {
  products: "Products",
  items: "Voucher_Items",
  history: "Voucher_History",
  confirmed: "Confirmed_Orders",
  confirmedItems: "Confirmed_Order_Items"
};


const sid = () =>
  process.env.SPREADSHEET_ID || "";


/* =========================================================
   GOOGLE AUTH
========================================================= */

function auth() {

  const raw =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_JSON."
    );
  }

  return new google.auth.GoogleAuth({

    credentials:
      JSON.parse(raw),

    scopes: [
      "https://www.googleapis.com/auth/spreadsheets"
    ]

  });
}


const api = () =>
  google.sheets({
    version: "v4",
    auth: auth()
  });


/* =========================================================
   SHEET HELPERS
========================================================= */

async function vals(
  range,
  options = {}
) {

  const result =
    await api()
      .spreadsheets
      .values
      .get({

        spreadsheetId:
          sid(),

        range,

        ...options

      });

  return (
    result.data.values || []
  );
}


async function append(
  range,
  row
) {

  await api()
    .spreadsheets
    .values
    .append({

      spreadsheetId:
        sid(),

      range,

      valueInputOption:
        "USER_ENTERED",

      insertDataOption:
        "INSERT_ROWS",

      requestBody: {
        values: [row]
      }

    });
}


async function replace(
  range,
  rows
) {

  await api()
    .spreadsheets
    .values
    .clear({

      spreadsheetId:
        sid(),

      range,

      requestBody: {}

    });


  if (!rows.length) {
    return;
  }


  await api()
    .spreadsheets
    .values
    .update({

      spreadsheetId:
        sid(),

      range:
        range.split(":")[0],

      valueInputOption:
        "USER_ENTERED",

      requestBody: {
        values: rows
      }

    });
}


/* =========================================================
   RESPONSE
========================================================= */

const res = (
  data,
  status = 200
) => {

  return new Response(

    JSON.stringify(data),

    {

      status,

      headers: {

        "Content-Type":
          "application/json",

        "Access-Control-Allow-Origin":
          "*",

        "Access-Control-Allow-Methods":
          "GET,POST,OPTIONS",

        "Access-Control-Allow-Headers":
          "Content-Type",

        "Cache-Control":
          "no-store"

      }

    }

  );
};


/* =========================================================
   HELPERS
========================================================= */

const d = value =>
  String(
    value || ""
  ).slice(0, 10);


const vno = (
  date,
  number
) => {

  return (
    `V-${date.replaceAll("-", "")}-` +
    `${String(number).padStart(3, "0")}`
  );

};


function parsePrice(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }


  const cleaned =
    String(value)
      .replace(/,/g, "")
      .replace(/[^\d.-]/g, "");


  const number =
    parseFloat(cleaned);


  return Number.isFinite(number)
    ? number
    : 0;
}


/* =========================================================
   FIND NEXT VOUCHER NUMBER
========================================================= */

async function next(date) {

  const history =
    await vals(
      `${S.history}!A2:G`
    );


  const numbers =
    history

      .filter(
        row =>
          d(row[2]) === date
      )

      .map(
        row => {

          const match =
            String(
              row[0] || ""
            ).match(
              /-(\d+)$/
            );

          return Number(
            match?.[1] || 0
          );

        }
      );


  const nextNumber =
    (
      numbers.length
        ? Math.max(...numbers)
        : 0
    ) + 1;


  return vno(
    date,
    nextNumber
  );
}


/* =========================================================
   GET VOUCHER
========================================================= */

async function getVoucher(
  no
) {

  const history =
    await vals(
      `${S.history}!A2:G`
    );


  const row =
    history.find(
      x =>
        x[0] === no
    );


  if (!row) {

    throw new Error(
      "Voucher not found."
    );

  }


  const items =
    await vals(
      `${S.items}!A2:H`
    );


  return {

    voucherNo:
      no,

    clientName:
      row[1] || "",

    date:
      d(row[2]),

    total:
      parsePrice(row[3]),

    status:
      row[4] || "Pending",

    statusDate:
      row[5] || "",

    items:

      items

        .filter(
          x =>
            x[0] === no
        )

        .map(
          x => ({

            productId:
              x[3],

            description:
              x[4],

            quantity:
              Number(
                x[5] || 0
              ),

            unitPrice:
              parsePrice(
                x[6]
              ),

            lineTotal:
              parsePrice(
                x[7]
              )

          })
        )

  };

}


/* =========================================================
   UPDATE VOUCHER
========================================================= */

async function updateVoucher(
  body
) {

  const voucherNo =
    String(
      body.voucherNo || ""
    ).trim();

  const clientName =
    String(
      body.clientName || ""
    ).trim();

  const date =
    d(body.date);

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
      "Customer name is required."
    );

  }


  if (!date) {

    throw new Error(
      "Date is required."
    );

  }


  if (!items.length) {

    throw new Error(
      "Add at least one product."
    );

  }


  /* -------------------------------------------------------
     GET CURRENT HISTORY
  ------------------------------------------------------- */

  const history =
    await vals(
      `${S.history}!A2:G`
    );


  const index =
    history.findIndex(
      row =>
        row[0] === voucherNo
    );


  if (index < 0) {

    throw new Error(
      "Voucher not found."
    );

  }


  const oldRow =
    history[index];


  const currentStatus =
    oldRow[4] ||
    "Pending";


  /* -------------------------------------------------------
     ONLY PENDING VOUCHERS CAN BE EDITED
  ------------------------------------------------------- */

  if (
    currentStatus !==
    "Pending"
  ) {

    throw new Error(
      "Only Pending vouchers can be edited."
    );

  }


  /* -------------------------------------------------------
     CLEAN ITEMS + CALCULATE TOTAL
  ------------------------------------------------------- */

  const cleanedItems =
    items.map(
      item => {

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

        const lineTotal =
          quantity *
          unitPrice;


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

      }
    );


  const total =
    cleanedItems.reduce(
      (
        sum,
        row
      ) =>
        sum +
        parsePrice(row[7]),
      0
    );


  /* -------------------------------------------------------
     UPDATE HISTORY ROW
  ------------------------------------------------------- */

  const newHistoryRow = [

    voucherNo,

    clientName,

    date,

    total,

    "Pending",

    oldRow[5] || "",

    oldRow[6] || ""

  ];


  history[index] =
    newHistoryRow;


  /* -------------------------------------------------------
     REWRITE HISTORY
  ------------------------------------------------------- */

  await replace(

    `${S.history}!A2:G`,

    history

  );


  /* -------------------------------------------------------
     GET EXISTING VOUCHER ITEMS
  ------------------------------------------------------- */

  const existingItems =
    await vals(
      `${S.items}!A2:H`
    );


  const remainingItems =
    existingItems.filter(
      row =>
        row[0] !== voucherNo
    );


  /* -------------------------------------------------------
     ADD UPDATED ITEMS
  ------------------------------------------------------- */

  const finalItems = [

    ...remainingItems,

    ...cleanedItems

  ];


  /* -------------------------------------------------------
     REWRITE VOUCHER ITEMS
  ------------------------------------------------------- */

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
   UPDATE HISTORY STATUS
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
      row =>
        row[0] ===
        voucherNo
    );


  if (index < 0) {

    throw new Error(
      "Voucher not found."
    );

  }


  const row =
    history[index];


  row[4] =
    newStatus;


  row[5] =
    new Date()
      .toISOString();


  await api()
    .spreadsheets
    .values
    .update({

      spreadsheetId:
        sid(),

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
   DELETE VOUCHER
========================================================= */

async function deleteVoucher(
  voucherNo
) {

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
      row =>
        row[0] !==
        voucherNo
    )

  );


  await replace(

    `${S.history}!A2:G`,

    history.filter(
      row =>
        row[0] !==
        voucherNo
    )

  );


  await replace(

    `${S.confirmed}!A2:F`,

    confirmed.filter(
      row =>
        row[0] !==
        voucherNo
    )

  );


  await replace(

    `${S.confirmedItems}!A2:H`,

    confirmedItems.filter(
      row =>
        row[0] !==
        voucherNo
    )

  );


  return {
    ok: true
  };

}


/* =========================================================
   CONFIRM VOUCHER
========================================================= */

async function confirmVoucher(
  voucherNo
) {

  const voucher =
    await getVoucher(
      voucherNo
    );


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
      row =>
        row[0] ===
        voucherNo
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

        new Date()
          .toISOString()

      ]

    );

  }


  const confirmedItems =
    await vals(
      `${S.confirmedItems}!A2:H`
    );


  const existingItems =
    confirmedItems.some(
      row =>
        row[0] ===
        voucherNo
    );


  if (!existingItems) {

    for (
      const item of
      voucher.items
    ) {

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
   CREATE VOUCHER
========================================================= */

async function createVoucher(
  body
) {

  const clientName =
    String(
      body.clientName || ""
    ).trim();

  const date =
    d(body.date);

  const items =
    Array.isArray(body.items)
      ? body.items
      : [];


  if (!clientName) {

    throw new Error(
      "Customer name is required."
    );

  }


  if (!date) {

    throw new Error(
      "Date is required."
    );

  }


  if (!items.length) {

    throw new Error(
      "Add at least one product."
    );

  }


  const voucherNo =
    await next(date);


  const cleanedItems =
    items.map(
      item => {

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

        const lineTotal =
          quantity *
          unitPrice;


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

      }
    );


  const total =
    cleanedItems.reduce(
      (
        sum,
        row
      ) =>
        sum +
        parsePrice(row[7]),
      0
    );


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


  for (
    const row of
    cleanedItems
  ) {

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
   RESET TODAY
========================================================= */

async function resetToday(
  date
) {

  const history =
    await vals(
      `${S.history}!A2:G`
    );


  const items =
    await vals(
      `${S.items}!A2:H`
    );


  const confirmed =
    await vals(
      `${S.confirmed}!A2:F`
    );


  const confirmedItems =
    await vals(
      `${S.confirmedItems}!A2:H`
    );


  const todaysNumbers =
    history

      .filter(
        row =>
          d(row[2]) === date
      )

      .map(
        row =>
          row[0]
      );


  await replace(

    `${S.history}!A2:G`,

    history.filter(
      row =>
        d(row[2]) !== date
    )

  );


  await replace(

    `${S.items}!A2:H`,

    items.filter(
      row =>
        !todaysNumbers.includes(
          row[0]
        )
    )

  );


  await replace(

    `${S.confirmed}!A2:F`,

    confirmed.filter(
      row =>
        !todaysNumbers.includes(
          row[0]
        )
    )

  );


  await replace(

    `${S.confirmedItems}!A2:H`,

    confirmedItems.filter(
      row =>
        !todaysNumbers.includes(
          row[0]
        )
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


  return rows

    .filter(
      row =>
        String(
          row[7] || ""
        ).toLowerCase() ===
        "yes"
    )

    .map(
      row => ({

        productId:
          row[0] || "",

        category:
          row[1] || "",

        description:
          row[2] || "",

        cartonPrice:
          parsePrice(
            row[3]
          ),

        currency:
          row[4] || "NGN",

        priceUnit:
          row[5] || "Carton",

        pack:
          row[6] || "",

        active:
          row[7] || ""

      })
    );

}


/* =========================================================
   GET HISTORY
========================================================= */

async function getHistory() {

  const rows =
    await vals(
      `${S.history}!A2:G`
    );


  return rows

    .filter(
      row =>
        row[0]
    )

    .map(
      row => ({

        no:
          row[0] || "",

        client:
          row[1] || "",

        date:
          d(row[2]),

        total:
          parsePrice(
            row[3]
          ),

        status:
          row[4] ||
          "Pending",

        statusDate:
          row[5] || ""

      })
    )

    .reverse();

}


/* =========================================================
   ROUTER
========================================================= */

export default async function handler(
  event
) {

  try {

    if (
      event.httpMethod ===
      "OPTIONS"
    ) {

      return res({
        ok: true
      });

    }


    /* =====================================================
       GET
    ===================================================== */

    if (
      event.httpMethod ===
      "GET"
    ) {

      const params =
        event.queryStringParameters ||
        {};


      if (
        params.mode ===
        "products"
      ) {

        return res(
          await getProducts()
        );

      }


      if (
        params.mode ===
        "history"
      ) {

        return res(
          await getHistory()
        );

      }


      if (
        params.mode ===
        "get" &&
        params.voucherNo
      ) {

        return res(
          await getVoucher(
            params.voucherNo
          )
        );

      }


      return res({
        ok: true
      });

    }


    /* =====================================================
       POST
    ===================================================== */

    if (
      event.httpMethod ===
      "POST"
    ) {

      const body =
        JSON.parse(
          event.body ||
          "{}"
        );


      if (
        body.action ===
        "create"
      ) {

        return res(
          await createVoucher(
            body
          )
        );

      }


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

        return res(
          await updateStatus(
            body.voucherNo,
            "Cancelled"
          )
        );

      }


      if (
        body.action ===
        "delete"
      ) {

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

        {
          error:
            "Unknown action."
        },

        400

      );

    }


    return res(

      {
        error:
          "Method not allowed."
      },

      405

    );

  }

  catch (error) {

    console.error(
      error
    );


    return res(

      {
        error:
          error.message ||
          "Server error."
      },

      500

    );

  }

}
