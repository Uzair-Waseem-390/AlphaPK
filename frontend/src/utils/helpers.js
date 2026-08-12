// Returns today's date as YYYY-MM-DD in the browser's LOCAL timezone.
//
// `new Date().toISOString().split('T')[0]` looks equivalent but isn't —
// toISOString() always returns UTC, so for any UTC+ timezone (e.g.
// Pakistan, UTC+5) it silently returns YESTERDAY's date whenever the local
// time is between midnight and the UTC offset (e.g. 12:00am-5:00am PKT).
// Every date-input default across the app must use this instead.
export const todayLocalDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
