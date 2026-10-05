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


  /* Remove confirmed order record */

  await replace(

    `${S.confirmed}!A2:F`,

    confirmed.filter(
      row =>
        row[0] !==
        voucherNo
    )

  );


  /* Remove confirmed order items */

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


  /* Already confirmed */

  if (
    voucher.status ===
    "Confirmed"
  ) {

    return {
      ok: true,
      alreadyConfirmed: true
    };

  }


  /* Cannot confirm cancelled */

  if (
    voucher.status ===
    "Cancelled"
  ) {

    throw new Error(
      "Cancelled vouchers cannot be confirmed."
    );

  }


  /* Update history */

  await updateStatus(
    voucherNo,
    "Confirmed"
  );


  /* Check for existing confirmed record */

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


  /* Add confirmed order */

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


  /* Check confirmed items */

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


  /* Add confirmed items */

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
   CANCEL VOUCHER
========================================================= */

async function cancelVoucher(
  voucherNo
) {

  const voucher =
    await getVoucher(
      voucherNo
    );


  /* Already cancelled */

  if (
    voucher.status ===
    "Cancelled"
  ) {

    return {
      ok: true,
      alreadyCancelled: true
    };

  }


  /* Cannot cancel confirmed order */

  if (
    voucher.status ===
    "Confirmed"
  ) {

    throw new Error(
      "Confirmed vouchers cannot be cancelled."
    );

  }


  /* Pending -> Cancelled */

  await updateStatus(
    voucherNo,
    "Cancelled"
  );


  return {
    ok: true
  };

}


/* =========================================================
   MAIN HANDLER
========================================================= */

export default async function handler(
  req
) {

  try {

    const url =
      new URL(
        req.url
      );


    /* =====================================================
       OPTIONS
    ===================================================== */

    if (
      req.method ===
      "OPTIONS"
    ) {

      return new Response(
        "",
        {

          status: 204,

          headers: {

            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Methods":
              "GET,POST,OPTIONS",

            "Access-Control-Allow-Headers":
              "Content-Type"

          }

        }
      );

    }


    /* =====================================================
       PRODUCTS
    ===================================================== */

    if (

      req.method ===
      "GET" &&

      url.pathname.endsWith(
        "/products"
      )

    ) {

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

          .filter(
            row => {

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

            }
          )

          .map(
            row => ({

              id:
                row[0],

              description:
                row[2],

              price:
                parsePrice(
                  row[3]
                )

            })
          );


      return res({
        products
      });

    }


    /* =====================================================
       HISTORY
    ===================================================== */

    if (

      req.method ===
      "GET" &&

      url.pathname.endsWith(
        "/history"
      )

    ) {

      const rows =
        await vals(
          `${S.history}!A2:G`
        );


      return res({
        rows
      });

    }


    /* =====================================================
       GET VOUCHERS
    ===================================================== */

    if (

      req.method ===
      "GET" &&

      url.pathname.endsWith(
        "/vouchers"
      )

    ) {

      const mode =
        url.searchParams.get(
          "mode"
        );


      /* NEXT NUMBER */

      if (
        mode ===
        "next"
      ) {

        const date =
          url.searchParams.get(
            "date"
          ) ||

          new Date()
            .toISOString()
            .slice(0, 10);


        return res({

          voucherNo:
            await next(
              date
            )

        });

      }


      /* GET ONE VOUCHER */

      if (
        mode ===
        "get"
      ) {

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


    /* =====================================================
       POST VOUCHERS
    ===================================================== */

    if (

      req.method ===
      "POST" &&

      url.pathname.endsWith(
        "/vouchers"
      )

    ) {

      const body =
        await req.json();


      /* ===================================================
         DELETE
      =================================================== */

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


      /* ===================================================
         CONFIRM
      =================================================== */

      if (
        body.action ===
        "confirm"
      ) {

        if (
          !body.voucherNo
        ) {

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


      /* ===================================================
         CANCEL
      =================================================== */

      if (
        body.action ===
        "cancel"
      ) {

        if (
          !body.voucherNo
        ) {

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


      /* ===================================================
         RESET
      =================================================== */

      if (
        body.action ===
        "reset"
      ) {

        const history =
          await vals(
            `${S.history}!A2:G`
          );


        if (
          history.some(
            row =>
              d(row[2]) ===
              body.date
          )
        ) {

          throw new Error(
            "Cannot reset: vouchers already exist for today."
          );

        }


        return res({
          ok: true
        });

      }


      /* ===================================================
         VALIDATE NEW VOUCHER
      =================================================== */

      if (
        !body.clientName
      ) {

        throw new Error(
          "Client name is required."
        );

      }


      if (
        !body.date
      ) {

        throw new Error(
          "Date is required."
        );

      }


      if (
        !Array.isArray(
          body.items
        ) ||

        !body.items.length
      ) {

        throw new Error(
          "At least one product is required."
        );

      }


      /* ===================================================
         CREATE VOUCHER NUMBER
      =================================================== */

      const voucherNo =
        await next(
          body.date
        );


      /* ===================================================
         CALCULATE TOTAL
      =================================================== */

      const total =
        body.items.reduce(

          (
            sum,
            item
          ) => {

            const quantity =
              Number(
                item.quantity ||
                0
              );


            const unitPrice =
              parsePrice(
                item.unitPrice
              );


            return (
              sum +
              quantity *
              unitPrice
            );

          },

          0

        );


      /* ===================================================
         SAVE HISTORY
      =================================================== */

      await append(

        `${S.history}!A2:G`,

        [

          voucherNo,

          body.clientName,

          body.date,

          total,

          "Pending",

          "",

          ""

        ]

      );


      /* ===================================================
         SAVE ITEMS
      =================================================== */

      for (
        const item of
        body.items
      ) {

        const quantity =
          Number(
            item.quantity ||
            0
          );


        const unitPrice =
          parsePrice(
            item.unitPrice
          );


        const lineTotal =
          quantity *
          unitPrice;


        await append(

          `${S.items}!A2:H`,

          [

            voucherNo,

            body.clientName,

            body.date,

            item.productId,

            item.description,

            quantity,

            unitPrice,

            lineTotal

          ]

        );

      }


      return res({

        ok: true,

        voucherNo,

        total

      });

    }


    /* =====================================================
       NOT FOUND
    ===================================================== */

    return res(

      {
        error:
          "Not found"
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


/* =========================================================
   NETLIFY FUNCTION CONFIG
========================================================= */

export const config = {
  path: "/api/*"
};