async function loadVisitStats() {
    const counter = document.getElementById('visitCounter');
    const location = document.getElementById('visitLocation');

    if (!counter || !location) {
        return;
    }

    try {
        const response = await fetch('/api/visit');
        const data = await response.json();

        counter.textContent = 'Visited in the last 24 hours: ' + data.totalVisits + ' unique IP' + (data.totalVisits === 1 ? '' : 's');
        location.textContent = 'Location: ' + (data.location || 'Unavailable');
    } catch (error) {
        counter.textContent = 'Visited in the last 24 hours: unavailable';
        location.textContent = 'Location: unavailable';
    }
}

loadVisitStats();
