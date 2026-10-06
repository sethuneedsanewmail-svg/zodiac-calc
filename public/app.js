const state = {
  products: [],
  editing: false,
  editingVoucherNo: null
};


const itemsEl =
  document.getElementById("items");

const clientNameEl =
  document.getElementById("clientName");

const dateEl =
  document.getElementById("date");

const totalEl =
  document.getElementById("total");

const voucherNumberEl =
  document.getElementById("voucherNumber");

const saveBtn =
  document.getElementById("saveBtn");

const clearBtn =
  document.getElementById("clearBtn");

const cancelEditBtn =
  document.getElementById("cancelEditBtn");

const voucherModeTitle =
  document.getElementById("voucherModeTitle");

const voucherModeSubtitle =
  document.getElementById("voucherModeSubtitle");

const editBadge =
  document.getElementById("editBadge");


/* =========================================================
   API
========================================================= */

async function api(
  url,
  options = {}
) {

  const response =
    await fetch(
      url,
      {
        cache: "no-store",
        ...options
      }
    );


  const data =
    await response.json()
      .catch(
        () => ({})
      );


  if (!response.ok) {

    throw new Error(
      data.error ||
      "Request failed."
    );

  }


  return data;
}


/* =========================================================
   MONEY
========================================================= */

function money(
  value
) {

  return (
    "₦" +
    Number(
      value || 0
    ).toLocaleString(
      "en-NG",
      {
        maximumFractionDigits: 2
      }
    )
  );

}


/* =========================================================
   TODAY
========================================================= */

function today() {

  const now =
    new Date();


  const offset =
    now.getTimezoneOffset();


  const local =
    new Date(
      now.getTime() -
      offset * 60000
    );


  return local
    .toISOString()
    .slice(
      0,
      10
    );

}


/* =========================================================
   LOAD PRODUCTS
========================================================= */

async function loadProducts() {

  state.products =
    await api(
      "/api/products?mode=products"
    );


}


/* =========================================================
   PRODUCT OPTIONS
========================================================= */

function productOptions(
  selectedId = ""
) {

  const options = [

    `<option value="">
      Select product
    </option>`

  ];


  for (
    const product of
    state.products
  ) {

    const selected =
      product.productId ===
      selectedId
        ? "selected"
        : "";


    options.push(

      `<option
        value="${escapeHtml(product.productId)}"
        ${selected}
      >
        ${escapeHtml(product.description)}
      </option>`

    );

  }


  return options.join("");
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   ADD ITEM
========================================================= */

function addItem(
  itemData = null
) {

  const template =
    document.getElementById(
      "itemTemplate"
    );


  const clone =
    template.content.cloneNode(
      true
    );


  const row =
    clone.querySelector(
      ".item-card"
    );

  const product =
    clone.querySelector(
      ".product"
    );

  const quantity =
    clone.querySelector(
      ".quantity"
    );

  const price =
    clone.querySelector(
      ".price"
    );

  const lineTotal =
    clone.querySelector(
      ".line-total"
    );


  product.innerHTML =
    productOptions(
      itemData?.productId ||
      ""
    );


  quantity.value =
    itemData?.quantity ??
    1;


  price.value =
    itemData?.unitPrice ??
    "";


  function updateRow() {

    const productId =
      product.value;


    const selected =
      state.products.find(
        p =>
          p.productId ===
          productId
      );


    if (
      selected &&
      !price.value
    ) {

      price.value =
        selected.cartonPrice;

    }


    const qty =
      Number(
        quantity.value || 0
      );


    const unitPrice =
      Number(
        price.value || 0
      );


    const total =
      qty *
      unitPrice;


    lineTotal.textContent =
      money(total);


    calculateTotal();

  }


  product.addEventListener(
    "change",
    () => {

      const selected =
        state.products.find(
          p =>
            p.productId ===
            product.value
        );


      if (selected) {

        price.value =
          selected.cartonPrice;

      }


      updateRow();

    }
  );


  quantity.addEventListener(
    "input",
    updateRow
  );


  price.addEventListener(
    "input",
    updateRow
  );


  const remove =
    clone.querySelector(
      ".remove-item"
    );


  remove.addEventListener(
    "click",
    () => {

      row.remove();

      calculateTotal();

    }
  );


  itemsEl.appendChild(
    clone
  );


  updateRow();

}


/* =========================================================
   CALCULATE TOTAL
========================================================= */

function calculateTotal() {

  let total = 0;


  document
    .querySelectorAll(
      ".item-card"
    )
    .forEach(
      row => {

        const quantity =
          Number(
            row.querySelector(
              ".quantity"
            ).value || 0
          );


        const price =
          Number(
            row.querySelector(
              ".price"
            ).value || 0
          );


        const line =
          quantity *
          price;


        row.querySelector(
          ".line-total"
        ).textContent =
          money(line);


        total +=
          line;

      }
    );


  totalEl.textContent =
    money(total);

}


/* =========================================================
   COLLECT VOUCHER
========================================================= */

function collect() {

  const rows =
    Array.from(
      document.querySelectorAll(
        ".item-card"
      )
    );


  const items =
    rows.map(
      row => {

        const productId =
          row.querySelector(
            ".product"
          ).value;


        const product =
          state.products.find(
            p =>
              p.productId ===
              productId
          );


        const quantity =
          Number(
            row.querySelector(
              ".quantity"
            ).value || 0
          );


        const unitPrice =
          Number(
            row.querySelector(
              ".price"
            ).value || 0
          );


        return {

          productId,

          description:
            product?.description ||
            "",

          quantity,

          unitPrice

        };

      }
    );


  return {

    clientName:
      clientNameEl.value.trim(),

    date:
      dateEl.value,

    items

  };

}


/* =========================================================
   SAVE NEW
========================================================= */

async function saveNew() {

  const voucher =
    collect();


  if (!voucher.clientName) {

    alert(
      "Enter customer name."
    );

    return;

  }


  if (!voucher.date) {

    alert(
      "Select a date."
    );

    return;

  }


  if (!voucher.items.length) {

    alert(
      "Add at least one product."
    );

    return;

  }


  for (
    const item of
    voucher.items
  ) {

    if (!item.productId) {

      alert(
        "Select a product for every row."
      );

      return;

    }


    if (
      item.quantity <= 0
    ) {

      alert(
        "Quantity must be greater than zero."
      );

      return;

    }

  }


  saveBtn.disabled =
    true;


  saveBtn.textContent =
    "Saving...";


  try {

    const result =
      await api(
        "/api",
        {

          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              action:
                "create",
              ...voucher
            })

        }
      );


    alert(
      `Voucher ${result.voucherNo} saved successfully.`
    );


    window.location.href =
      "/history.html";

  }

  catch (error) {

    alert(
      error.message
    );

  }

  finally {

    saveBtn.disabled =
      false;

    saveBtn.textContent =
      "Save Voucher";

  }

}


/* =========================================================
   UPDATE EXISTING
========================================================= */

async function updateExisting() {

  const voucher =
    collect();


  if (!voucher.clientName) {

    alert(
      "Enter customer name."
    );

    return;

  }


  if (!voucher.date) {

    alert(
      "Select a date."
    );

    return;

  }


  if (!voucher.items.length) {

    alert(
      "Add at least one product."
    );

    return;

  }


  for (
    const item of
    voucher.items
  ) {

    if (!item.productId) {

      alert(
        "Select a product for every row."
      );

      return;

    }


    if (
      item.quantity <= 0
    ) {

      alert(
        "Quantity must be greater than zero."
      );

      return;

    }

  }


  saveBtn.disabled =
    true;


  saveBtn.textContent =
    "Saving Changes...";


  try {

    const result =
      await api(
        "/api",
        {

          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              action:
                "update",

              voucherNo:
                state.editingVoucherNo,

              ...voucher

            })

        }
      );


    alert(
      `Voucher ${result.voucherNo} updated successfully.`
    );


    window.location.href =
      "/history.html";

  }

  catch (error) {

    alert(
      error.message
    );

  }

  finally {

    saveBtn.disabled =
      false;

    saveBtn.textContent =
      "Save Changes";

  }

}


/* =========================================================
   LOAD VOUCHER FOR EDIT
========================================================= */

async function loadForEdit(
  voucherNo
) {

  state.editing =
    true;

  state.editingVoucherNo =
    voucherNo;


  try {

    const voucher =
      await api(
        `/api/vouchers?mode=get&voucherNo=${encodeURIComponent(voucherNo)}`
      );


    if (
      voucher.status !==
      "Pending"
    ) {

      alert(
        "Only Pending vouchers can be edited."
      );


      window.location.href =
        "/history.html";

      return;

    }


    clientNameEl.value =
      voucher.clientName;


    dateEl.value =
      voucher.date;


    itemsEl.innerHTML =
      "";


    for (
      const item of
      voucher.items
    ) {

      addItem(
        item
      );

    }


    voucherNumberEl.textContent =
      voucher.voucherNo;


    voucherModeTitle.textContent =
      "Edit Voucher";


    voucherModeSubtitle.textContent =
      "Edit the existing customer order";


    editBadge.hidden =
      false;


    saveBtn.textContent =
      "Save Changes";


    cancelEditBtn.hidden =
      false;


    calculateTotal();

  }

  catch (error) {

    alert(
      error.message
    );


    window.location.href =
      "/history.html";

  }

}


/* =========================================================
   CANCEL EDIT
========================================================= */

function cancelEdit() {

  window.location.href =
    "/history.html";

}


/* =========================================================
   CLEAR FORM
========================================================= */

function clearForm() {

  clientNameEl.value =
    "";


  dateEl.value =
    today();


  itemsEl.innerHTML =
    "";


  addItem();

  calculateTotal();

}


/* =========================================================
   RESET NUMBERING
========================================================= */

async function resetToday() {

  const date =
    today();


  const confirmed =
    confirm(
      `Reset all voucher numbering for ${date}?\n\nThis will delete today's vouchers and their related records.`
    );


  if (!confirmed) {
    return;
  }


  try {

    await api(
      "/api",
      {

        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            action:
              "reset",

            date

          })

      }
    );


    alert(
      "Today's vouchers have been reset."
    );


    window.location.reload();

  }

  catch (error) {

    alert(
      error.message
    );

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  try {

    await loadProducts();


    const params =
      new URLSearchParams(
        window.location.search
      );


    const editVoucher =
      params.get(
        "edit"
      );


    if (editVoucher) {

      await loadForEdit(
        editVoucher
      );

      return;

    }


    dateEl.value =
      today();


    voucherNumberEl.textContent =
      "New Voucher";


    addItem();


    calculateTotal();

  }

  catch (error) {

    console.error(
      error
    );


    alert(
      error.message
    );

  }

}


/* =========================================================
   EVENTS
========================================================= */

document
  .getElementById(
    "addItemBtn"
  )
  ?.addEventListener(
    "click",
    () => addItem()
  );


saveBtn
  ?.addEventListener(
    "click",
    () => {

      if (
        state.editing
      ) {

        updateExisting();

      }

      else {

        saveNew();

      }

    }
  );


clearBtn
  ?.addEventListener(
    "click",
    () => {

      if (
        state.editing
      ) {

        window.location.href =
          "/";

      }

      else {

        clearForm();

      }

    }
  );


cancelEditBtn
  ?.addEventListener(
    "click",
    cancelEdit
  );


document
  .getElementById(
    "resetTodayBtn"
  )
  ?.addEventListener(
    "click",
    resetToday
  );


init();
