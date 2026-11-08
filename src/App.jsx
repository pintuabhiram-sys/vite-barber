import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

const SERVICES = [
  { id: 's1', name: 'Haircut', price: 499, dur: 30, desc: 'Cut + wash + style' },
  { id: 's2', name: 'Beard Trim', price: 299, dur: 20, desc: 'Shape & trim beard' },
  { id: 's3', name: 'Shave', price: 399, dur: 35, desc: 'Hot towel shave' },
  { id: 's4', name: 'Haircut + Beard', price: 749, dur: 50, desc: 'Full combo' },
  { id: 's5', name: 'Kids Haircut', price: 299, dur: 25, desc: 'Under 12 years' },
];
const BARBERS = [
  { id: 'marco', name: 'Marco', role: 'Master Barber' },
  { id: 'diego', name: 'Diego', role: 'Fade Specialist' },
  { id: 'sam', name: 'Sam', role: 'Shave Expert' },
];
const money = (amount) => `₹${amount}`;
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const formatBookingId = (id) => {
  const code = String(id ?? '').replace(/^B-/i, '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  return `#B-${code.slice(-6).padStart(6, '0')}`;
};
const DEFAULT_SETTINGS = { openingTime: '10:00', closingTime: '20:00', slotDuration: 30 };

function loadSalonSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('the-chair-settings') ?? 'null');
    if (
      saved && /^\d{2}:\d{2}$/.test(saved.openingTime)
      && /^\d{2}:\d{2}$/.test(saved.closingTime)
      && [30, 45, 60].includes(Number(saved.slotDuration))
    ) return { ...saved, slotDuration: Number(saved.slotDuration) };
  } catch { /* Use the default salon hours when saved data is unavailable. */ }
  return DEFAULT_SETTINGS;
}

function loadHolidayOverrides() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('the-chair-holiday-overrides') ?? '[]');
    return Array.isArray(saved) ? saved.filter((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && typeof item.occasion === 'string' && (item.type === 'closed' || (item.type === 'custom' && /^\d{2}:\d{2}$/.test(item.openingTime) && /^\d{2}:\d{2}$/.test(item.closingTime)))) : [];
  } catch { return []; }
}

function clockValueToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatClockValue(value) {
  const minute = clockValueToMinutes(value);
  if (minute === null) return value;
  const hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function generateTimeSlots(settings, serviceDuration) {
  const open = clockValueToMinutes(settings.openingTime);
  const close = clockValueToMinutes(settings.closingTime);
  const interval = Number(settings.slotDuration);
  if (open === null || close === null || close <= open || ![30, 45, 60].includes(interval)) return [];
  const times = [];
  for (let minute = open; minute + serviceDuration <= close; minute += interval) {
    times.push(formatClockValue(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`));
  }
  return times;
}

function makeDays(startOffset = 0, count = 7) {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const dayOffset = startOffset + i;
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { iso, label: dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : date.toLocaleDateString('en', { weekday: 'short' }), day: date.getDate(), month: date.toLocaleDateString('en', { month: 'short' }) };
  });
}
const DAYS = makeDays();
const serviceById = (id) => SERVICES.find((service) => service.id === id);
const barberById = (id, barbers = BARBERS) => barbers.find((barber) => barber.id === id) ?? BARBERS.find((barber) => barber.id === id) ?? { name: 'Removed barber', role: '' };
function loadAdminSession() {
  try { return window.localStorage.getItem('adminToken') === 'true'; }
  catch { return false; }
}
const timeToMinutes = (value) => {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value ?? '');
  if (!match) return -1;
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour * 60 + Number(match[2]);
};
const isLunchBreakSlot = (slot) => slot === '1:00 PM' || slot === '1:30 PM';
const getSalonMinuteOfDay = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return Number(values.hour) * 60 + Number(values.minute);
};

export default function App() {
  const [tab, setTab] = useState('book');
  const [bookingFilter, setBookingFilter] = useState('upcoming');
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
  const isAdmin = currentPath === '/admin';
  const isAdminLogin = currentPath === '/admin/login';
  const [adminAuthenticated, setAdminAuthenticated] = useState(loadAdminSession);
  const [barbers, setBarbers] = useState(() => {
    try {
      const saved = window.localStorage.getItem('the-chair-barbers');
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) && parsed.length && parsed.every((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.role === 'string') ? parsed : BARBERS;
    } catch {
      return BARBERS;
    }
  });
  const [salonSettings, setSalonSettings] = useState(loadSalonSettings);
  const [holidayOverrides, setHolidayOverrides] = useState(loadHolidayOverrides);
  const [selectedService, setSelectedService] = useState('s1');
  const [barber, setBarber] = useState(() => barbers[0]?.id ?? BARBERS[0].id);
  const [date, setDate] = useState(() => DAYS[0].iso);
  const [time, setTime] = useState(null);
  const [bookings, setBookings] = useState(() => {
    try {
      const saved = window.localStorage.getItem('the-chair-bookings');
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) && parsed.every((item) => item && typeof item.id === 'string' && Array.isArray(item.services)) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [blocked] = useState([{ date: DAYS[0].iso, barber: 'marco', time: '1:00 PM' }]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [salonMinute, setSalonMinute] = useState(getSalonMinuteOfDay);
  const [toast, setToast] = useState('');
  const [adminDate, setAdminDate] = useState(DAYS[0].iso);
  const [adminBarber, setAdminBarber] = useState('all');
  const selectedServiceDetails = serviceById(selectedService) ?? SERVICES[0];
  const total = selectedServiceDetails.price;
  const duration = selectedServiceDetails.dur;
  const selectedDateOverride = holidayOverrides.find((item) => item.date === date);
  const todayHoursOverride = holidayOverrides.find((item) => item.date === DAYS[0].iso);
  const isSelectedDateClosed = selectedDateOverride?.type === 'closed';
  const isTodayClosed = todayHoursOverride?.type === 'closed';
  const bookingHours = useMemo(() => selectedDateOverride?.type === 'custom' ? { ...salonSettings, openingTime: selectedDateOverride.openingTime, closingTime: selectedDateOverride.closingTime } : salonSettings, [salonSettings, selectedDateOverride]);
  const todayBookingHours = useMemo(() => todayHoursOverride?.type === 'custom' ? { ...salonSettings, openingTime: todayHoursOverride.openingTime, closingTime: todayHoursOverride.closingTime } : salonSettings, [salonSettings, todayHoursOverride]);
  const times = useMemo(() => isSelectedDateClosed ? [] : generateTimeSlots(bookingHours, duration), [isSelectedDateClosed, bookingHours, duration]);
  const todayTimeSlots = useMemo(() => isTodayClosed ? [] : generateTimeSlots(todayBookingHours, duration), [isTodayClosed, todayBookingHours, duration]);
  const timeGroups = useMemo(() => [
    { name: 'Morning', slots: times.filter((slot) => timeToMinutes(slot) < 12 * 60) },
    { name: 'Afternoon', slots: times.filter((slot) => timeToMinutes(slot) >= 12 * 60 && timeToMinutes(slot) < 17 * 60) },
    { name: 'Evening', slots: times.filter((slot) => timeToMinutes(slot) >= 17 * 60) },
  ].filter((group) => group.slots.length > 0), [times]);
  useEffect(() => {
    const refreshSettings = (event) => {
      if (event.key === 'the-chair-settings') {
        try {
          const next = event.newValue ? JSON.parse(event.newValue) : DEFAULT_SETTINGS;
          if (/^\d{2}:\d{2}$/.test(next.openingTime) && /^\d{2}:\d{2}$/.test(next.closingTime) && [30, 45, 60].includes(Number(next.slotDuration))) {
            setSalonSettings({ ...next, slotDuration: Number(next.slotDuration) });
          }
        } catch { setSalonSettings(DEFAULT_SETTINGS); }
      }
      if (event.key === 'the-chair-holiday-overrides') setHolidayOverrides(loadHolidayOverrides());
    };
    window.addEventListener('storage', refreshSettings);
    return () => window.removeEventListener('storage', refreshSettings);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setSalonMinute(getSalonMinuteOfDay()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (isAdminLogin && adminAuthenticated) window.location.replace('/admin');
  }, [isAdminLogin, adminAuthenticated]);
  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2500); };
  const slotFree = (d, b, t) => {
    if (holidayOverrides.some((item) => item.date === d && item.type === 'closed')) return false;
    if (isLunchBreakSlot(t)) return false;
    const barberIds = b === 'any' ? barbers.map((item) => item.id) : [b];
    return barberIds.some((barberId) => !bookings.some((item) => item.date === d && item.barber === barberId && item.time === t && item.status !== 'Cancelled') && !blocked.some((item) => item.date === d && item.barber === barberId && item.time === t));
  };
  const todayHasAvailableSlots = todayTimeSlots.some((slot) => timeToMinutes(slot) > salonMinute && !isLunchBreakSlot(slot) && slotFree(DAYS[0].iso, 'any', slot));
  const bookingDays = useMemo(() => makeDays(todayHasAvailableSlots ? 0 : 1, 7), [todayHasAvailableSlots]);
  useLayoutEffect(() => {
    if (!isAdmin && date === DAYS[0].iso && !todayHasAvailableSlots && DAYS[1]) setDate(DAYS[1].iso);
  }, [isAdmin, date, todayHasAvailableSlots]);
  useEffect(() => {
    if (!time) return;
    const hasPassed = date === DAYS[0].iso && timeToMinutes(time) <= salonMinute;
    if (!times.includes(time) || isLunchBreakSlot(time) || hasPassed || !slotFree(date, barber, time)) setTime(null);
  }, [time, times, date, barber, salonMinute, bookings, barbers, duration, holidayOverrides]);

  const changeDate = (nextDate) => { setDate(nextDate); if (!slotFree(nextDate, barber, time)) setTime(null); };
  const confirmBooking = () => {
    if (isBooking) return;
    if (!date) { notify('Please choose a date'); return; }
    if (!name.trim()) { notify('Please enter your name'); return; }
    if (!/^\d{10}$/.test(phone)) { notify('Enter your 10-digit phone number'); return; }
    if (!time || !times.includes(time)) { notify('Please pick an available time'); return; }
    if (!slotFree(date, barber, time)) { notify('Slot just taken, pick another'); setTime(null); return; }
    setIsBooking(true);
    window.setTimeout(() => {
      const assignedBarber = barber === 'any' ? barbers.find((item) => slotFree(date, item.id, time))?.id : barber;
      if (!assignedBarber || !slotFree(date, assignedBarber, time)) {
        notify('Slot just taken, pick another');
        setTime(null);
        setIsBooking(false);
        return;
      }
      let id;
      do { id = `B-${Math.floor(Math.random() * (36 ** 6)).toString(36).toUpperCase().padStart(6, '0')}`; } while (bookings.some((item) => item.id === id));
      persistBookings([{ id, name: name.trim(), phone: `+91 ${phone}`, services: [selectedService], barber: assignedBarber, date, time, total, dur: duration, status: 'Confirmed', mine: true, notes: notes.trim() }, ...bookings]);
      setNotes(''); notify(`Booking confirmed! #${id}`); setIsBooking(false); setBookingFilter('upcoming'); setTab('bookings');
    }, 300);
  };
  const updateBooking = (id, status, message) => {
    persistBookings(bookings.map((item) => item.id === id ? { ...item, status } : item));
    notify(message);
  };
  const cancelCustomerBooking = (id) => {
    if (!window.confirm('Cancel this booking?')) return;
    updateBooking(id, 'Cancelled', 'Booking cancelled');
    setBookingFilter('past');
  };
  const formatDate = (iso) => {
    const found = DAYS.find((day) => day.iso === iso);
    if (found) return `${found.label}, ${found.day} ${found.month}`;
    const dateValue = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(dateValue.valueOf())) return iso;
    const label = iso === makeDays(1, 1)[0].iso ? 'Tomorrow' : dateValue.toLocaleDateString('en', { weekday: 'short' });
    const month = dateValue.toLocaleDateString('en', { month: 'short' });
    return `${label}, ${dateValue.getDate()} ${month}`;
  };
  const active = bookings.filter((item) => item.status === 'Confirmed');
  const filtered = bookings.filter((item) => item.date === adminDate && (adminBarber === 'all' || item.barber === adminBarber));
  const bookingReady = Boolean(date && time && name.trim() && /^\d{10}$/.test(phone) && times.includes(time) && slotFree(date, barber, time) && !(date === DAYS[0].iso && timeToMinutes(time) <= salonMinute));
  const customerBookings = bookings.filter((item) => item.mine);
  const isUpcomingBooking = (item) => item.status === 'Confirmed' && (item.date > DAYS[0].iso || (item.date === DAYS[0].iso && timeToMinutes(item.time) > salonMinute));
  const displayedCustomerBookings = customerBookings.filter((item) => bookingFilter === 'upcoming' ? isUpcomingBooking(item) : !isUpcomingBooking(item));
  const persistBookings = (nextBookings) => {
    setBookings(nextBookings);
    window.localStorage.setItem('the-chair-bookings', JSON.stringify(nextBookings));
  };
  const persistBarbers = (nextBarbers) => {
    setBarbers(nextBarbers);
    window.localStorage.setItem('the-chair-barbers', JSON.stringify(nextBarbers));
    if (nextBarbers.length && !nextBarbers.some((item) => item.id === barber)) setBarber(nextBarbers[0].id);
  };
  const saveSalonSettings = (nextSettings) => {
    const normalized = { ...nextSettings, slotDuration: Number(nextSettings.slotDuration) };
    setSalonSettings(normalized);
    window.localStorage.setItem('the-chair-settings', JSON.stringify(normalized));
    notify('Salon settings saved');
  };
  const loginAdmin = (username, password) => {
    const normalizedUsername = username.trim().toLowerCase();
    if (normalizedUsername !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) return false;
    window.localStorage.setItem('adminToken', 'true');
    setAdminAuthenticated(true);
    return true;
  };
  const logoutAdmin = () => {
    window.localStorage.removeItem('adminToken');
    setAdminAuthenticated(false);
    window.location.replace('/admin/login');
  };
  const saveHolidayOverride = (nextOverride) => {
    const nextOverrides = [...holidayOverrides.filter((item) => item.date !== nextOverride.date), nextOverride].sort((a, b) => a.date.localeCompare(b.date));
    setHolidayOverrides(nextOverrides);
    window.localStorage.setItem('the-chair-holiday-overrides', JSON.stringify(nextOverrides));
    notify('Special hours saved');
  };
  const removeHolidayOverride = (dateToRemove) => {
    const nextOverrides = holidayOverrides.filter((item) => item.date !== dateToRemove);
    setHolidayOverrides(nextOverrides);
    window.localStorage.setItem('the-chair-holiday-overrides', JSON.stringify(nextOverrides));
    notify('Special date removed');
  };
  const statusOpeningTime = todayHoursOverride?.type === 'custom' ? todayHoursOverride.openingTime : salonSettings.openingTime;
  const statusClosingTime = todayHoursOverride?.type === 'custom' ? todayHoursOverride.closingTime : salonSettings.closingTime;
  const statusOpeningMinute = clockValueToMinutes(statusOpeningTime);
  const statusClosingMinute = clockValueToMinutes(statusClosingTime);
  const isSalonOpen = todayHoursOverride?.type !== 'closed' && statusOpeningMinute !== null && statusClosingMinute !== null && salonMinute >= statusOpeningMinute && salonMinute < statusClosingMinute;
  const addBarber = (name, role) => {
    const id = `barber-${Date.now()}`;
    persistBarbers([...barbers, { id, name, role }]);
  };
  const removeBarber = (id) => persistBarbers(barbers.filter((item) => item.id !== id));
  const adminDateLabel = (iso) => {
    const dateValue = new Date(`${iso}T12:00:00`);
    return Number.isNaN(dateValue.valueOf()) ? iso : dateValue.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  };
  if (isAdminLogin) return <AdminLogin onLogin={loginAdmin} />;
  if (isAdmin) return <ProtectedRoute><AdminPortal bookings={bookings} barbers={barbers} activeBookings={active} salonSettings={salonSettings} holidayOverrides={holidayOverrides} dateLabel={adminDateLabel} toast={toast} onUpdate={updateBooking} onAddBarber={addBarber} onRemoveBarber={removeBarber} onSaveSettings={saveSalonSettings} onSaveHolidayOverride={saveHolidayOverride} onLogout={logoutAdmin} onRemoveHolidayOverride={removeHolidayOverride} /></ProtectedRoute>;

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <div className="brand"><div className="brand-icon" aria-hidden="true">✂</div><div><h1>The Chair</h1><p>Barbershop · Fort Kochi</p></div></div>
          <div className={`open-status ${isSalonOpen ? 'is-open' : 'is-closed'}`} role="status"><span />{isSalonOpen ? 'Open' : 'Closed'}</div>
        </div>
        {isAdmin ? <nav className="tabs admin-nav"><a className="tab" href="/">← Customer side</a><span className="tab active">Admin</span></nav> : <nav className="tabs" aria-label="Customer navigation">
          {[['book', 'Book'], ['bookings', 'My Bookings']].map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`tab ${tab === id ? 'active' : ''}`}>{label}</button>)}
        </nav>}
      </header>

      <main className="main-content">
        {!isAdmin && tab === 'book' && <section className="booking-flow">
          <section className="card"><h2><Step n="1" />What service do you want?</h2><div className="service-list">
            {SERVICES.map((item) => <button type="button" key={item.id} onClick={() => setSelectedService(item.id)} className={`service-option ${item.id === 's5' ? 'kids-service-option col-span-1 md:col-span-2' : ''} ${selectedService === item.id ? 'selected' : ''}`} aria-pressed={selectedService === item.id}><span><strong>{item.name}</strong><small>{item.desc}</small></span><span className="price-detail"><strong>{money(item.price)}</strong><small>{item.dur} min</small></span></button>)}
          </div></section>
          <section className="card"><h2><Step n="2" />Pick your barber</h2><div className="barber-grid">
            {[{ id: 'any', name: 'Any Barber', role: 'Fastest availability' }, ...barbers].map((item) => <button type="button" key={item.id} onClick={() => { setBarber(item.id); if (!slotFree(date, item.id, time)) setTime(null); }} className={`barber-option ${barber === item.id ? 'selected' : ''}`} aria-pressed={barber === item.id}><span className="avatar">{item.name[0]}</span><strong>{item.name}</strong><small>{item.role}</small></button>)}
          </div></section>
          <section className="card"><h2><Step n="3" />Choose date and time</h2><div className="date-list">
            {bookingDays.map((item) => { const override = holidayOverrides.find((entry) => entry.date === item.iso); const closed = override?.type === 'closed'; const noSlotsToday = item.iso === DAYS[0].iso && !todayHasAvailableSlots; const disabled = closed || noSlotsToday; return <button type="button" key={item.iso} disabled={disabled} aria-label={closed ? `${item.label}, ${item.month} ${item.day}, closed for ${override.occasion}` : noSlotsToday ? `${item.label}, ${item.month} ${item.day}, no slots available` : `${item.label}, ${item.month} ${item.day}${override?.type === 'custom' ? ', special hours' : ''}`} title={closed ? `${override.occasion} · Closed` : noSlotsToday ? 'No slots available today' : override?.type === 'custom' ? `${override.occasion} · ${formatClockValue(override.openingTime)}–${formatClockValue(override.closingTime)}` : undefined} onClick={() => changeDate(item.iso)} className={`date-option ${date === item.iso ? 'selected' : ''} ${disabled ? 'date-closed' : ''} ${override?.type === 'custom' ? 'date-special-hours' : ''}`}><small>{item.label}</small><strong>{item.day}</strong><small>{closed ? 'Closed' : noSlotsToday ? 'No slots' : override?.type === 'custom' ? 'Special' : item.month}</small></button>; })}
          </div>{isSelectedDateClosed ? <p className="no-time-slots">Closed for {selectedDateOverride.occasion}.</p> : !date ? <p className="no-time-slots">Choose a date to see available times.</p> : times.length === 0 ? <p className="no-time-slots">No start times fit this service. Choose another service or contact the barbershop.</p> : <div className="time-groups">{timeGroups.map((group) => <section className="time-group" key={group.name}><h3>{group.name}</h3><div className="time-grid">{group.slots.map((item) => { const past = date === DAYS[0].iso && timeToMinutes(item) <= salonMinute; const isLunch = item === '1:00 PM' || item === '1:30 PM'; const free = !past && !isLunch && slotFree(date, barber, item); return <button type="button" key={item} disabled={!free} onClick={() => { if (free) setTime(item); }} className={`time-option ${time === item && free ? 'selected' : ''} ${!free ? 'unavailable' : ''}`}>{item}</button>; })}</div></section>)}</div>}</section>
          <section className="card"><h2><Step n="4" />Your details</h2><div className="form-fields">
            <label><span>Your name <span className="required-mark">*</span></span><input id="customer-name" required value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label><span>Phone number <span className="required-mark">*</span></span><span className="phone-input"><span className="country-prefix">+91</span><input type="tel" inputMode="numeric" autoComplete="tel-national" pattern="[0-9]{10}" maxLength={10} aria-label="10-digit mobile number" required value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit number" /></span><small className="field-helper">Enter your 10-digit mobile number.</small></label>
            <label>Any note? (optional)<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. short on sides" /></label>
          </div><div className="summary"><div><span>Service</span><strong>{selectedServiceDetails.name} ({selectedServiceDetails.dur} min)</strong></div><div><span>Barber</span><strong>{barber === 'any' ? 'Any Barber (Fastest)' : barberById(barber, barbers).name}</strong></div><div><span>Date</span><strong>{date ? formatDate(date) : 'Choose a date'}</strong></div><div><span>Time</span><strong className={time ? 'accent' : 'time-needed'}>{time || 'Select a time slot'}</strong></div><div className="summary-total"><span>Total</span><div className="summary-total-value"><strong className="accent">{money(total)}</strong><small>Pay at the salon (Cash / UPI)</small></div></div></div>
            <button type="button" className="primary-button desktop-book-button disabled:text-slate-500 disabled:bg-slate-100 disabled:font-medium disabled:border disabled:border-slate-200" disabled={!bookingReady || isBooking} aria-busy={isBooking} onClick={confirmBooking}>{isBooking ? 'Booking...' : 'Book Now'}</button>
          </section>
        </section>}

        {!isAdmin && tab === 'bookings' && <section className="card bookings-container p-6 sm:p-8 h-auto self-start">
          <header className="bookings-header"><div><h2>My Bookings</h2><p>Manage your appointments &amp; visit history</p></div>
            <div className="booking-filters" role="tablist" aria-label="Filter bookings">
              <button type="button" role="tab" aria-selected={bookingFilter === 'upcoming'} className={bookingFilter === 'upcoming' ? 'active' : ''} onClick={() => setBookingFilter('upcoming')}>Upcoming</button>
              <button type="button" role="tab" aria-selected={bookingFilter === 'past'} className={bookingFilter === 'past' ? 'active' : ''} onClick={() => setBookingFilter('past')}>Past / Cancelled</button>
            </div>
          </header>
          <hr className="border-t border-slate-200 my-4" />
          <div className="booking-content">
            {displayedCustomerBookings.length === 0 ? <div className="bookings-empty">
              <svg className="bookings-empty-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="7.5" y="10.5" width="33" height="30" rx="5" stroke="currentColor" strokeWidth="2"/><path d="M15 7v7M33 7v7M8 19h32M17 27h.01M23 27h.01M29 27h.01M17 33h.01M23 33h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="m29 32 8 8m0-8-8 8m2-6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm4 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <h3>{bookingFilter === 'upcoming' ? 'No upcoming appointments' : 'No past or cancelled appointments'}</h3>
              <p>Looking for a fresh cut? Pick your chair and time in seconds.</p>
              <button type="button" className="book-appointment-button" onClick={() => setTab('book')}>Book an Appointment</button>
            </div> : <div className="booking-list">{displayedCustomerBookings.map((item) => {
              const displayStatus = item.status === 'Cancelled' ? 'Cancelled' : !isUpcomingBooking(item) ? 'Completed' : item.status;
              const statusClass = displayStatus === 'Cancelled' ? 'cancelled' : displayStatus === 'Completed' ? 'completed' : 'confirmed';
              return <article className="booking-row" key={item.id}>
                <div className="booking-row-main"><strong className="booking-service-title">{item.services.map((id) => serviceById(id)?.name).filter(Boolean).join(' + ')}</strong><small>{formatBookingId(item.id)} · {barberById(item.barber, barbers).name}</small><p>{formatDate(item.date)} at {item.time} · {item.dur} mins</p></div>
                <div className="booking-row-side"><div className="booking-row-topline"><strong className="booking-row-price">{money(item.total)}</strong><span className={`status ${statusClass}`}>{displayStatus}</span></div>{isUpcomingBooking(item) ? <button className="text-button danger" onClick={() => cancelCustomerBooking(item.id)}>Cancel</button> : <button type="button" className="book-again-button" onClick={() => { setBookingFilter('upcoming'); setTab('book'); }}>Book Again</button>}</div>
              </article>;
            })}</div>}
          </div>
        </section>}

        {isAdmin && <section className="panel-flow"><div className="card intro-card"><h2>Admin Panel</h2><p>Manage bookings and block slots</p></div><div className="stats-grid"><div className="card stat"><small>Active Bookings</small><strong>{active.length}</strong></div><div className="card stat"><small>Revenue</small><strong className="accent">{money(active.reduce((sum, item) => sum + item.total, 0))}</strong></div></div><div className="card filters"><label>Filter by date<select value={adminDate} onChange={(event) => setAdminDate(event.target.value)}>{DAYS.map((item) => <option key={item.iso} value={item.iso}>{item.label} {item.day} {item.month}</option>)}</select></label><label>Filter by barber<select value={adminBarber} onChange={(event) => setAdminBarber(event.target.value)}><option value="all">All Barbers</option>{BARBERS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
          {filtered.length === 0 ? <div className="card empty-state">No bookings</div> : filtered.map((item) => <div className="card admin-card" key={item.id}><div className="admin-booking-top"><strong>{item.name}</strong><span>{item.time}</span></div><p>{item.services.map((id) => serviceById(id).name).join(', ')} · {barberById(item.barber).name} · {money(item.total)}</p><div className="actions">{item.status === 'Confirmed' ? <><button className="small-button success" onClick={() => updateBooking(item.id, 'Completed', 'Marked done')}>Mark Done</button><button className="small-button danger-outline" onClick={() => updateBooking(item.id, 'Cancelled', 'Booking cancelled')}>Cancel</button></> : <button className="small-button neutral" onClick={() => updateBooking(item.id, 'Confirmed', 'Re-opened')}>Re-open</button>}</div></div>)}
        </section>}
      </main>

      {tab === 'book' && <div className="bottom-bar"><div className="bottom-bar-inner"><div className="bottom-bar-summary"><strong>{money(total)}</strong><span>{duration} mins · Pay at salon</span></div><button className="primary-button disabled:text-slate-500 disabled:bg-slate-100 disabled:font-medium disabled:border disabled:border-slate-200" aria-busy={isBooking} disabled={!bookingReady || isBooking} onClick={confirmBooking}>{isBooking ? 'Booking...' : 'Book Now'}</button></div></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Step({ n }) { return <span className="step-number">{n}</span>; }

function Navigate({ to, replace = false }) {
  useEffect(() => {
    if (replace) window.location.replace(to);
    else window.location.assign(to);
  }, [to, replace]);
  return null;
}

function ProtectedRoute({ children }) {
  const hasToken = window.localStorage.getItem('adminToken') === 'true';
  return hasToken ? children : <Navigate replace to="/admin/login" />;
}

function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = (event) => {
    event.preventDefault();
    if (!onLogin(username, password)) setError('Invalid email/username or password. Please try again.');
  };
  return <main className="admin-login-page"><form className="admin-login-card" onSubmit={submit}>
    <div className="admin-login-brand"><span className="admin-login-mark">✂</span><span>The Chair</span></div>
    <h1>Admin sign in</h1>
    <p>Sign in to manage your barbershop dashboard.</p>
    <label>Username<input type="text" name="username" autoComplete="username" required value={username} onChange={(event) => { setUsername(event.target.value); setError(''); }} placeholder="Enter your username" /></label>
    <label>Password<input type="password" name="password" autoComplete="current-password" required value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} placeholder="Enter your password" /></label>
    {error && <p className="admin-login-error" role="alert">{error}</p>}
    <button type="submit" className="admin-login-submit">Sign in</button>
    <a className="admin-login-back" href="/">← Back to customer booking</a>
  </form></main>;
}

function AdminPortal({ bookings, barbers, activeBookings, salonSettings, holidayOverrides, dateLabel, toast, onUpdate, onAddBarber, onRemoveBarber, onSaveSettings, onSaveHolidayOverride, onRemoveHolidayOverride, onLogout }) {
  const [section, setSection] = useState('Bookings');
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sortNewest, setSortNewest] = useState(true);
  const [editing, setEditing] = useState(null);
  const [statusDraft, setStatusDraft] = useState('Confirmed');
  const visibleBookings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return bookings.filter((item) => {
      const barberName = barberById(item.barber, barbers)?.name ?? '';
      const serviceNames = item.services.map((id) => serviceById(id)?.name ?? '').join(' ');
      return !needle || [item.id, item.name, item.phone, item.status, barberName, serviceNames, item.time].join(' ').toLowerCase().includes(needle);
    }).sort((a, b) => {
      const dateOrder = a.date.localeCompare(b.date);
      const chronologicalOrder = dateOrder || timeToMinutes(a.time) - timeToMinutes(b.time);
      return sortNewest ? -chronologicalOrder : chronologicalOrder;
    });
  }, [bookings, barbers, query, sortNewest]);
  const pageCount = Math.max(1, Math.ceil(visibleBookings.length / pageSize));
  const rows = visibleBookings.slice((page - 1) * pageSize, page * pageSize);
  const revenue = activeBookings.reduce((sum, item) => sum + item.total, 0);

  return <div className="admin-layout">
    <aside className={`admin-sidebar ${menuOpen ? 'menu-open' : ''}`}>
      <div className="admin-sidebar-header"><a href="/admin" className="admin-profile"><span className="profile-avatar">C</span><span><strong>The Chair</strong><small><i /> Online</small></span></a><button type="button" className="mobile-menu-toggle" aria-label={menuOpen ? 'Close admin menu' : 'Open admin menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><span>{menuOpen ? '×' : '☰'}</span> Menu</button></div>
      <div className="sidebar-label">Administration</div>
      <nav className="admin-menu" aria-label="Admin sections">
        {[
          ['Dashboard', '◫'], ['Bookings', '♟'], ['Barbers', '✂'],
          ['Services', '▤'], ['Customers', '♙'],
        ].map(([label, icon]) => <button type="button" key={label} onClick={() => { setSection(label); setMenuOpen(false); }} aria-current={section === label ? 'page' : undefined} className={`menu-item ${section === label ? 'active' : ''}`}><span>{icon}</span>{label}</button>)}
        <div className="sidebar-label sidebar-spaced">System</div>
        <button type="button" onClick={() => { setSection('Settings'); setMenuOpen(false); }} aria-current={section === 'Settings' ? 'page' : undefined} className={`menu-item ${section === 'Settings' ? 'active' : ''}`}><span>⚙</span>Settings</button>
      </nav>
      <button type="button" className="logout-link" onClick={onLogout}><span>↪</span>Logout</button>
    </aside>
    {menuOpen && <button type="button" className="sidebar-backdrop" aria-label="Close admin menu" onClick={() => setMenuOpen(false)} />}
    <main className="admin-content">
      <div className="admin-page-heading"><div className="admin-heading-main"><div className="admin-heading-copy"><h1>{section}</h1><p>{section === 'Bookings' ? 'All appointments in the system.' : `${section} overview for The Chair.`}</p></div>{section === 'Bookings' && <a className="add-booking add-booking-header" href="/">＋ Add booking</a>}</div><div className="breadcrumbs">Admin <span>›</span> {section}{section === 'Bookings' && <> <span>›</span> List</>}</div></div>
      <div className="admin-section-view" key={section}>
      {section === 'Bookings' && <section className="admin-table-card">
        <div className="table-toolbar"><label className="page-size"> <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select> records per page</label><label className="search-field"><span className="search-icon" aria-hidden="true">⌕</span><input type="search" aria-label="Search bookings" placeholder="Search bookings..." value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label></div>
        <div className="table-scroll"><table className="bookings-table"><thead><tr><th><button onClick={() => setSortNewest(!sortNewest)}>Date <span>↕</span></button></th><th>Status</th><th>Customer</th><th>Service</th><th>Barber</th><th>Actions</th></tr></thead>
          <tbody>{rows.map((item) => <tr key={item.id}><td data-label="Date">{dateLabel(item.date)}<small>{item.time}</small></td><td data-label="Status"><span className={`table-status ${item.status.toLowerCase()}`}>{item.status}</span></td><td data-label="Customer"><strong>{item.name}</strong><small>{item.phone}</small></td><td data-label="Service">{item.services.map((id) => serviceById(id)?.name).filter(Boolean).join(' + ')}<small>{money(item.total)}</small></td><td data-label="Barber">{barberById(item.barber, barbers)?.name}</td><td className="row-actions">{item.status === 'Confirmed' && <button type="button" className="complete-action" onClick={() => onUpdate(item.id, 'Completed', 'Booking marked complete')}>Complete</button>}<button onClick={() => { setEditing(item); setStatusDraft(item.status); }}>✎ Edit</button><button className="delete-action" onClick={() => onUpdate(item.id, 'Cancelled', 'Booking cancelled')}>Cancel</button></td></tr>)}
            {rows.length === 0 && <tr className="empty-row"><td colSpan="6" className="table-empty">No bookings match your search.</td></tr>}</tbody></table></div>
        <div className="table-footer"><span>Showing {visibleBookings.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, visibleBookings.length)} of {visibleBookings.length} bookings</span><div><button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span className="current-page">{page}</span><button disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button></div></div>
      </section>}
      {section === 'Dashboard' && <><div className="admin-summary-cards"><div><small>Confirmed bookings</small><strong>{activeBookings.length}</strong></div><div><small>Confirmed revenue</small><strong>{money(revenue)}</strong></div><div><small>Total bookings</small><strong>{bookings.length}</strong></div></div><section className="admin-table-card dashboard-recent"><div className="table-actions"><strong>Recent bookings</strong><button className="plain-admin-link" onClick={() => setSection('Bookings')}>View all bookings →</button></div><div className="table-scroll"><table className="bookings-table"><thead><tr><th>Customer</th><th>Date</th><th>Service</th><th>Barber</th><th>Status</th></tr></thead><tbody>{bookings.slice(0, 5).map((item) => <tr key={item.id}><td data-label="Customer">{item.name}<small>{item.phone}</small></td><td data-label="Date">{dateLabel(item.date)}<small>{item.time}</small></td><td data-label="Service">{item.services.map((id) => serviceById(id)?.name).filter(Boolean).join(' + ')}</td><td data-label="Barber">{barberById(item.barber, barbers)?.name}</td><td data-label="Status"><span className={`table-status ${item.status.toLowerCase()}`}>{item.status}</span></td></tr>)}{bookings.length === 0 && <tr className="empty-row"><td colSpan="5" className="table-empty">No bookings yet.</td></tr>}</tbody></table></div></section></>}
      {section === 'Barbers' && <BarberManagement barbers={barbers} onAdd={onAddBarber} onRemove={onRemoveBarber} />}
      {section === 'Services' && <AdminDirectory title="Services" columns={['Service', 'Description', 'Duration', 'Price']} rows={SERVICES.map((item) => [item.name, item.desc, `${item.dur} min`, money(item.price)])} />}
      {section === 'Customers' && <CustomerDirectory bookings={bookings} />}
      {section === 'Settings' && <div className="settings-stack"><SalonSettings settings={salonSettings} onSave={onSaveSettings} /><HolidaySettings overrides={holidayOverrides} dateLabel={dateLabel} onAdd={onSaveHolidayOverride} onRemove={onRemoveHolidayOverride} /></div>}
      </div>
    </main>
    {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-booking-title"><h2 id="edit-booking-title">Edit booking {editing.id}</h2><p>{editing.name} · {dateLabel(editing.date)} at {editing.time}</p><label>Status<select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>{['Confirmed', 'Completed', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</select></label><div className="modal-actions"><button onClick={() => setEditing(null)}>Close</button><button className="add-booking" onClick={() => { onUpdate(editing.id, statusDraft, 'Booking updated'); setEditing(null); }}>Save changes</button></div></section></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

function BarberManagement({ barbers, onAdd, onRemove }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const submit = (event) => {
    event.preventDefault();
    if (!name.trim() || !role.trim()) { setError('Enter the barber name and specialty.'); return; }
    onAdd(name.trim(), role.trim());
    setName(''); setRole(''); setError('');
  };
  return <div className="barber-management">
    <form className="admin-table-card barber-add-form" onSubmit={submit}><div className="table-actions"><strong>Add a barber</strong></div><div className="barber-form-fields"><label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Alex" /></label><label>Specialty<input value={role} onChange={(event) => setRole(event.target.value)} placeholder="e.g. Classic cuts" /></label><button type="submit" className="add-booking">＋ Add barber</button></div>{error && <p className="form-error" role="alert">{error}</p>}</form>
    <section className="admin-table-card"><div className="table-actions"><strong>Barbers</strong><span className="barber-count">{barbers.length} total</span></div><div className="table-scroll"><table className="bookings-table"><thead><tr><th>Name</th><th>Specialty</th><th>Status</th><th>Actions</th></tr></thead><tbody>{barbers.map((item) => <tr key={item.id}><td data-label="Name"><strong>{item.name}</strong></td><td data-label="Specialty">{item.role}</td><td data-label="Status"><span className="table-status confirmed">Active</span></td><td data-label="Actions"><button className="remove-barber" disabled={barbers.length <= 1} title={barbers.length <= 1 ? 'Keep at least one barber' : `Remove ${item.name}`} onClick={() => onRemove(item.id)}>Remove</button></td></tr>)}{barbers.length === 0 && <tr className="empty-row"><td colSpan="4" className="table-empty">No barbers added yet.</td></tr>}</tbody></table></div></section>
    <p className="barber-note">Removing a barber takes them out of future booking choices. Existing bookings remain in the records.</p>
  </div>;
}

function AdminDirectory({ title, columns, rows }) {
  return <section className="admin-table-card"><div className="table-actions"><strong>{title}</strong></div><div className="table-scroll"><table className="bookings-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.join('-')}>{row.map((cell, index) => <td data-label={columns[index]} key={`${index}-${cell}`}>{cell}</td>)}</tr>)}{rows.length === 0 && <tr className="empty-row"><td className="table-empty" colSpan={columns.length}>No {title.toLowerCase()} yet.</td></tr>}</tbody></table></div></section>;
}

function SalonSettings({ settings, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState('');
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = (event) => {
    event.preventDefault();
    const opening = clockValueToMinutes(draft.openingTime);
    const closing = clockValueToMinutes(draft.closingTime);
    if (opening === null || closing === null || closing <= opening) {
      setError('Closing time must be later than opening time.');
      return;
    }
    onSave(draft);
    setError('');
    setEditing(false);
  };
  const cancel = () => { setDraft(settings); setError(''); setEditing(false); };

  return <section className="admin-table-card salon-settings-card">
    <div className="salon-settings-heading"><div><strong>Salon settings</strong><p>Set the hours and slot spacing customers can book.</p></div>{!editing && <button type="button" className="settings-edit-button" onClick={() => { setDraft(settings); setEditing(true); }}>Edit Settings</button>}</div>
    {editing ? <form className="salon-settings-form" onSubmit={save}>
      <label>Opening Time<input type="time" required value={draft.openingTime} onChange={(event) => update('openingTime', event.target.value)} /></label>
      <label>Closing Time<input type="time" required value={draft.closingTime} onChange={(event) => update('closingTime', event.target.value)} /></label>
      <label>Slot Duration<select value={draft.slotDuration} onChange={(event) => update('slotDuration', Number(event.target.value))}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
      {error && <p className="settings-error" role="alert">{error}</p>}
      <div className="settings-form-actions"><button type="button" className="settings-cancel-button" onClick={cancel}>Cancel</button><button type="submit" className="add-booking">Save</button></div>
    </form> : <div className="salon-settings-values"><div><span>Opening Time</span><strong>{formatClockValue(settings.openingTime)}</strong></div><div><span>Closing Time</span><strong>{formatClockValue(settings.closingTime)}</strong></div><div><span>Slot Duration</span><strong>{settings.slotDuration} minutes</strong></div><div><span>Business</span><strong>The Chair · Fort Kochi</strong></div><div><span>Currency</span><strong>Indian Rupee (₹)</strong></div><p>Saved settings are shared with the customer booking page on this browser.</p></div>}
  </section>;
}

function HolidaySettings({ overrides, dateLabel, onAdd, onRemove }) {
  const [draft, setDraft] = useState({ date: '', occasion: '', type: 'closed', openingTime: '10:00', closingTime: '20:00' });
  const [error, setError] = useState('');
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (!draft.date || !draft.occasion.trim()) { setError('Choose a date and enter an occasion name.'); return; }
    if (draft.type === 'custom') {
      const opening = clockValueToMinutes(draft.openingTime);
      const closing = clockValueToMinutes(draft.closingTime);
      if (opening === null || closing === null || closing <= opening) { setError('Closing time must be later than opening time.'); return; }
    }
    onAdd({ ...draft, occasion: draft.occasion.trim() });
    setDraft({ date: '', occasion: '', type: 'closed', openingTime: '10:00', closingTime: '20:00' });
    setError('');
  };

  return <section className="admin-table-card holiday-settings-card">
    <div className="holiday-settings-heading"><div><strong>Holidays &amp; Special Hours</strong><p>Set full-day closures or custom festival hours for specific dates.</p></div></div>
    <form className="holiday-form" onSubmit={submit}>
      <label>Date<input type="date" required value={draft.date} onChange={(event) => update('date', event.target.value)} /></label>
      <label>Occasion / Name<input type="text" required value={draft.occasion} onChange={(event) => update('occasion', event.target.value)} placeholder="e.g., Christmas, Onam" /></label>
      <fieldset className="holiday-type-field"><legend>Type</legend><label className={draft.type === 'closed' ? 'selected' : ''}><input type="radio" name="holiday-type" value="closed" checked={draft.type === 'closed'} onChange={() => update('type', 'closed')} /><span>Closed All Day</span></label><label className={draft.type === 'custom' ? 'selected' : ''}><input type="radio" name="holiday-type" value="custom" checked={draft.type === 'custom'} onChange={() => update('type', 'custom')} /><span>Custom Hours</span></label></fieldset>
      {draft.type === 'custom' && <div className="holiday-custom-hours"><label>Open<input type="time" required value={draft.openingTime} onChange={(event) => update('openingTime', event.target.value)} /></label><label>Close<input type="time" required value={draft.closingTime} onChange={(event) => update('closingTime', event.target.value)} /></label></div>}
      {error && <p className="holiday-error" role="alert">{error}</p>}
      <div className="holiday-form-actions"><button type="submit" className="add-booking">＋ Add Override</button></div>
    </form>
    <div className="holiday-list-heading"><strong>Special dates</strong><span>{overrides.length} added</span></div>
    {overrides.length === 0 ? <p className="holiday-empty">No holiday or special-hour overrides yet.</p> : <ul className="holiday-list">{overrides.map((item) => <li key={item.date}>
      <div className="holiday-list-copy"><strong>{item.occasion}</strong><span>{dateLabel(item.date)}</span></div>
      <span className={`holiday-badge ${item.type === 'closed' ? 'closed' : 'custom'}`}>{item.type === 'closed' ? 'Closed' : `${formatClockValue(item.openingTime)} – ${formatClockValue(item.closingTime)}`}</span>
      <button type="button" className="holiday-remove" aria-label={`Remove ${item.occasion} override`} onClick={() => onRemove(item.date)}>Remove</button>
    </li>)}</ul>}
  </section>;
}

function CustomerDirectory({ bookings }) {
  const customers = [...new Map(bookings.map((item) => [item.phone, {
    name: item.name,
    phone: item.phone,
    count: bookings.filter((booking) => booking.phone === item.phone).length,
  }])).values()];
  return <section className="customer-directory">
    <div className="customer-directory-heading"><strong>Customers</strong><span>{customers.length} total</span></div>
    {customers.length === 0 ? <div className="customer-empty">No customers yet.</div> : <div className="customer-directory-grid">{customers.map((customer) => <article className="customer-tile" key={customer.phone}>
      <span className="customer-avatar" aria-hidden="true">{customer.name.slice(0, 1).toUpperCase()}</span>
      <div className="customer-identity"><strong>{customer.name}</strong><a href={`tel:${customer.phone.replace(/[^+\d]/g, '')}`}>{customer.phone}</a></div>
      <div className="customer-booking-count"><strong>{customer.count}</strong><span>{customer.count === 1 ? 'booking' : 'bookings'}</span></div>
    </article>)}</div>}
  </section>;
}
