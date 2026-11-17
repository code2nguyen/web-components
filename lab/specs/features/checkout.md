---
id: checkout
title: The checkout of an online shop
size: feature
focus: []
directions: [default]
---

## Purpose

The checkout of an outdoor-gear shop, as on Shopify or Stripe Checkout: review the cart, give a delivery address,
pick a delivery speed, pay, and place the order. It exercises a multi-step flow with going back, an address that
follows its country, money arithmetic shown in several places, a promo code, a payment that can be declined, and a
final submit that waits for a server.

## Screens

- **Steps:** Cart, Delivery, Payment, Review, always visible, the current one marked; a completed step can be revisited
  by choosing it.
- **Order summary:** beside the steps on a wide screen, collapsed into "Show order summary · $226.80" above them on a
  phone. It lists the items, subtotal, discount, delivery, tax and total, and holds the promo code field.
- **Cart:** each item with its name, price, a quantity of 1 to 5 and Remove; "Continue to delivery".
- **Delivery:** email; the address (country first, then the fields that country uses); delivery speed (Standard, free,
  3–5 days; Express, $15.00, next day).
- **Payment:** card number, expiry and security code in one field, the name on the card, and "Billing address same as
  delivery" (on by default; off reveals a second address).
- **Review:** everything chosen so far, each with "Change", and "Place order".
- **Confirmation:** "Thank you", the order number and the total.

## Data

**Cart:** Trail runner shoes, $129.00 × 1 · Merino socks, $18.00 × 2 · Headlamp, $45.00 × 1. Subtotal $210.00.

**Money rules:** delivery Standard $0.00, Express $15.00. Promo code `SPRING10` takes 10% off the subtotal; `WINTER5`
is refused with "This code has expired"; any other code with "This code is not valid". Tax is 8% of the subtotal after
the discount, rounded to the cent. Total = subtotal − discount + delivery + tax.

| Case                       | Subtotal | Discount | Delivery | Tax    | Total   |
| -------------------------- | -------- | -------- | -------- | ------ | ------- |
| As loaded, Standard        | $210.00  | –        | $0.00    | $16.80 | $226.80 |
| SPRING10, Standard         | $210.00  | −$21.00  | $0.00    | $15.12 | $204.12 |
| SPRING10, Express          | $210.00  | −$21.00  | $15.00   | $15.12 | $219.12 |
| Socks quantity 3, Standard | $228.00  | –        | $0.00    | $18.24 | $246.24 |

**Countries:** France (default; street, postal code of 5 digits, city), United States (street, city, state, ZIP of 5
digits), United Kingdom (street, town, postcode).

**Cards** (simulated, no real payment): `4242 4242 4242 4242` succeeds; `4000 0000 0000 0002` is declined with "Your
card was declined. Try another card."; any other number is refused by its checksum before submitting. Expiry must be
in the future (now is March 2026).

**The server:** placing the order takes 1 second and returns order number `OUT-58213`, unless the card is the declined
one, in which case the flow returns to Payment with the error on the card field.

## Requirements

- R1 [nav.steps] The four steps show where the user is; a completed step can be revisited and the later ones keep
  their answers.
- R2 [input.money, i18n.format] Every amount is currency in the reader's locale, and every place an amount appears
  agrees (summary, collapsed summary, review, confirmation).
- R3 [input.number] Quantities change between 1 and 5, Remove takes an item out, and the amounts follow at once.
- R4 [input.address] The address fields follow the country, with that country's labels, order and postal-code check.
- R5 [input.choice] Delivery speed is one of two options shown at once, each with its price and timing.
- R6 [input.payment-card] The card is entered in one field, formatted as typed, checked by its checksum and expiry.
- R7 [form.conditional] Turning off "Billing address same as delivery" reveals a second address.
- R8 [form.validation, form.error-summary] Each step checks its fields before moving on and says what is missing.
- R9 [form.async-submit] Placing the order shows progress; a declined card returns to Payment with its error.
- R10 [layout.responsive] On a phone the summary collapses into its total above the steps.
- R11 [a11y.keyboard, a11y.screen-reader] The whole checkout works with the keyboard; the current step is announced.

## Tasks

### T1 · Change the cart (R2, R3)

- When I set the socks quantity to 3
- Then the total reads $246.24
- When I set it back to 2
- Then the total reads $226.80

### T2 · Apply a code (R2)

- When I enter WINTER5
- Then "This code has expired" shows and the total stays $226.80
- When I enter SPRING10
- Then the discount reads −$21.00 and the total $204.12

### T3 · Delivery to another country (R4, R5, R8)

- When I continue to Delivery and choose United States
- Then the fields are street, city, state and ZIP
- When I enter ZIP "9021" and continue
- Then the ZIP field says it needs 5 digits
- When I choose Express
- Then the total grows by $15.00

### T4 · A declined card (R6, R9)

- When I pay with 4000 0000 0000 0002, review and place the order
- Then I am back on Payment with "Your card was declined. Try another card." on the card field

### T5 · Place the order (R1, R7, R9)

- When I pay with 4242 4242 4242 4242, turn off "Billing address same as delivery", fill the billing address, review
  and place the order
- Then the confirmation shows OUT-58213 and the same total as the review

### T6 · Go back and change (R1)

- Given I am on Review
- When I choose Change next to the delivery speed and pick Standard
- Then I return to Review with every other answer kept and the total updated

### T7 · On a phone (R10)

- Given a phone-sized screen
- Then "Show order summary · $226.80" is above the steps and opens the summary

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules). Never send a card number anywhere: the server is simulated
in the page.
