---
id: appointment-booking
title: Booking an appointment at a barber shop
size: scenario
focus: [c2-date-selector, c2-time-slot-picker, c2-phone-input, c2-radio-group, c2-form]
directions: [default]
---

## Purpose

The online booking page of a small business, as on Booksy, Fresha or Calendly: pick a service, a day, a time, leave
a name and a phone number, confirm. It exercises date and time picking with real constraints (closed days, opening
hours, booked slots, a service longer than one slot, nothing in the past) and a short validated form.

## Screens

One page, top to bottom (side by side from 960px: choices on the left, a summary on the right).

- **Service:** three options shown at once, each with its name, duration and price.
- **Day:** a calendar of the bookable days.
- **Time:** the free start times of the chosen day for the chosen service, or a message when there are none.
- **Your details:** name, phone number, a note for the barber.
- **Summary:** the service, the day and time, the price, and "Confirm booking". After confirming, the summary becomes
  a confirmation with the booking reference.

## Data

**Now** is Monday 2 March 2026, 10:15, in the shop's time zone (Europe/Paris). The page fixes this date; it does not
read the clock.

**Services:** Haircut, 30 min, $35.00 · Cut & colour, 90 min, $120.00 · Beard trim, 30 min, $20.00. Haircut is chosen
by default.

**Bookable days:** today and the next 13 days (2 to 15 March). Closed on Sundays (8 and 15 March) and on Friday 13
March (staff training).

**Opening hours:** Monday to Friday 09:00 to 17:30, Saturday 09:00 to 13:00. Appointments start on the half hour and
must end by closing time. Nothing starts less than an hour from now, so today the first start is 11:30.

**Already booked** (each a 30-minute slot): Tuesday 3 March 09:00, 10:00 and 14:30; Saturday 7 March every slot except
12:30.

Free starts that follow: a Haircut on Tuesday 3 March has 14 (first 09:30); a Cut & colour on Tuesday 3 March first
starts at 10:30, since it needs three free slots in a row; a Haircut today has 12 (11:30 to 17:00); a Haircut on
Saturday 7 March has only 12:30, and a Cut & colour that day has none.

**The server:** `book(request)` answers after 500ms with the reference `BK-3021`; a phone number ending in `0000` is
refused with "This number cannot receive text messages".

## Requirements

- R1 [input.choice] The three services are shown at once and one is picked; each shows its duration and price.
- R2 [input.date] The calendar offers 2 to 15 March only; Sundays, 13 March and past days cannot be picked and say why
  to a screen reader.
- R3 [input.time-slot] The times shown are the free starts of the chosen day for the chosen service; changing the
  service updates them; a day with none says so.
- R4 [input.phone] The phone number takes its country (France by default) and is checked as a number of that country.
- R5 [form.validation] Name and phone are required; the errors show on the fields when "Confirm booking" is chosen.
- R6 [form.async-submit] Confirming shows progress, then the confirmation; a refused number shows its error on the
  phone field.
- R7 [i18n.format] The day and time read in the reader's language ("Tuesday, March 3, 2026 at 9:30 AM", "mardi 3 mars
  2026 à 09:30") and prices as currency.
- R8 [layout.responsive] On a phone the steps stack and the summary follows them.
- R9 [a11y.keyboard, a11y.screen-reader] The calendar and the times work with arrow keys; each time is read with its
  day.

## Tasks

### T1 · Book a haircut (R1, R2, R3, R6, R7)

- When I pick Tuesday 3 March and 09:30, enter "Léa Martin" and "06 12 34 56 78", and confirm
- Then the confirmation shows BK-3021, Haircut, Tuesday, March 3, 2026 at 9:30 AM, $35.00

### T2 · Booked and past slots are not offered (R3)

- When I pick today
- Then the first time offered is 11:30
- When I pick Tuesday 3 March
- Then 09:00, 10:00 and 14:30 are not offered and 14 times are

### T3 · A longer service needs room (R1, R3)

- When I choose Cut & colour and pick Tuesday 3 March
- Then the first time offered is 10:30
- When I pick Saturday 7 March
- Then no time is offered and the page says the day is full for this service

### T4 · Closed days (R2)

- Then Sunday 8 March and Friday 13 March cannot be picked

### T5 · Missing and refused details (R4, R5, R6)

- When I pick a day and a time and confirm with the details empty
- Then the name and the phone show their errors
- When I enter "Léa Martin" and "06 12 34 00 00" and confirm
- Then the phone field says "This number cannot receive text messages"

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules).
