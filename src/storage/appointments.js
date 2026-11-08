import { DEMO_BARBERS, DEMO_SERVICES, SALON_TIME_ZONE } from '../data/demoCatalog.js';

export const APPOINTMENTS_STORAGE_KEY = 'stylebook.appointments.v1';

const APPOINTMENTS_CHANGED_EVENT = 'stylebook:appointments-changed';
const VALID_STATUSES = new Set(['pending', 'confirmed', 'cancelled', 'completed']);
const BLOCKING_STATUSES = new Set(['pending', 'confirmed']);
const serviceById = new Map(DEMO_SERVICES.map((service) => [service.id, service]));
const barberIds = new Set(DEMO_BARBERS.map((barber) => barber.id));

export class AppointmentStorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AppointmentStorageError';
    this.code = code;
  }
}

function makeId(appointments) {
  let id;

  do {
    id = globalThis.crypto?.randomUUID?.()
      ?? `appointment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } while (appointments.some((appointment) => appointment.id === id));

  return id;
}

// Interpret the date and time as salon wall-clock time, independent of the
// customer's device timezone. Kolkata does not observe daylight saving time.
function getSalonMinute(date, time) {
  if (typeof date !== 'string' || typeof time !== 'string') return null;

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (year < 1000 || month < 1 || month > 12 || hour > 23 || minute > 59) return null;

  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day
  ) {
    return null;
  }

  return Date.UTC(year, month - 1, day, hour, minute) / 60_000;
}

function normalizeAppointment(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const service = serviceById.get(value.serviceId);
  if (
    typeof value.id !== 'string'
    || !value.id
    || !service
    || !barberIds.has(value.barberId)
    || typeof value.customerName !== 'string'
    || !value.customerName.trim()
    || !VALID_STATUSES.has(value.status)
    || getSalonMinute(value.date, value.startTime) === null
  ) {
    return null;
  }

  return {
    id: value.id,
    customerName: value.customerName.trim(),
    customerPhone: typeof value.customerPhone === 'string' ? value.customerPhone.trim() : '',
    serviceId: service.id,
    barberId: value.barberId,
    date: value.date,
    startTime: value.startTime,
    timeZone: SALON_TIME_ZONE,
    status: value.status,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
}

function readAppointments() {
  if (typeof window === 'undefined') return [];

  try {
    const storedValue = window.localStorage.getItem(APPOINTMENTS_STORAGE_KEY);
    if (storedValue === null) return [];

    const parsedValue = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue
      .map(normalizeAppointment)
      .filter(Boolean)
      .sort((first, second) => (
        getSalonMinute(first.date, first.startTime) - getSalonMinute(second.date, second.startTime)
      ));
  } catch {
    // Missing, malformed, or browser-blocked storage should not crash the UI.
    return [];
  }
}

function writeAppointments(appointments) {
  if (typeof window === 'undefined') {
    throw new AppointmentStorageError('BROWSER_STORAGE_UNAVAILABLE', 'Appointments can only be saved in a browser.');
  }

  try {
    window.localStorage.setItem(APPOINTMENTS_STORAGE_KEY, JSON.stringify(appointments));
    window.dispatchEvent(new Event(APPOINTMENTS_CHANGED_EVENT));
  } catch {
    throw new AppointmentStorageError(
      'STORAGE_WRITE_FAILED',
      'The browser could not save this appointment. Check that localStorage is available.',
    );
  }
}

function validateSchedule({ serviceId, barberId, date, startTime }) {
  const service = serviceById.get(serviceId);
  if (!service) {
    throw new AppointmentStorageError('INVALID_SERVICE', 'Choose a service from the demo service list.');
  }
  if (!barberIds.has(barberId)) {
    throw new AppointmentStorageError('INVALID_BARBER', 'Choose a barber from the demo barber list.');
  }

  const startMinute = getSalonMinute(date, startTime);
  if (startMinute === null) {
    throw new AppointmentStorageError('INVALID_DATE_OR_TIME', 'Use a valid date and 24-hour start time.');
  }

  return {
    service,
    startMinute,
    endMinute: startMinute + service.durationMinutes + service.bufferMinutes,
  };
}

export function getAppointments() {
  return readAppointments();
}

export function checkAvailability(schedule, { excludeAppointmentId } = {}) {
  const { service, startMinute, endMinute } = validateSchedule(schedule);

  const conflict = readAppointments().find((appointment) => {
    if (
      appointment.id === excludeAppointmentId
      || appointment.barberId !== schedule.barberId
      || !BLOCKING_STATUSES.has(appointment.status)
    ) {
      return false;
    }

    const existingService = serviceById.get(appointment.serviceId);
    const existingStart = getSalonMinute(appointment.date, appointment.startTime);
    const existingEnd = existingStart + existingService.durationMinutes + existingService.bufferMinutes;

    return existingStart < endMinute && startMinute < existingEnd;
  });

  return {
    available: !conflict,
    conflictingAppointmentId: conflict?.id ?? null,
    durationMinutes: service.durationMinutes,
    bufferMinutes: service.bufferMinutes,
    timeZone: SALON_TIME_ZONE,
  };
}

export function createAppointment(input) {
  if (!input || typeof input.customerName !== 'string' || !input.customerName.trim()) {
    throw new AppointmentStorageError('CUSTOMER_NAME_REQUIRED', 'Enter the customer name before booking.');
  }

  const schedule = {
    serviceId: input.serviceId,
    barberId: input.barberId,
    date: input.date,
    startTime: input.startTime,
  };
  validateSchedule(schedule);

  const appointments = readAppointments();
  const availability = checkAvailability(schedule);
  if (!availability.available) {
    throw new AppointmentStorageError('BARBER_UNAVAILABLE', 'That barber already has an appointment during this time.');
  }

  const now = new Date().toISOString();
  const appointment = normalizeAppointment({
    id: makeId(appointments),
    customerName: input.customerName,
    customerPhone: input.customerPhone ?? '',
    ...schedule,
    timeZone: SALON_TIME_ZONE,
    status: 'confirmed',
    createdAt: now,
    updatedAt: now,
  });

  writeAppointments([...appointments, appointment]);
  return appointment;
}

export function updateAppointment(appointmentId, updates) {
  const appointments = readAppointments();
  const currentIndex = appointments.findIndex((appointment) => appointment.id === appointmentId);
  if (currentIndex < 0) {
    throw new AppointmentStorageError('APPOINTMENT_NOT_FOUND', 'The appointment could not be found.');
  }

  const current = appointments[currentIndex];
  const updated = normalizeAppointment({
    ...current,
    ...updates,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  });

  if (!updated) {
    throw new AppointmentStorageError('INVALID_APPOINTMENT_UPDATE', 'The appointment changes are not valid.');
  }

  if (BLOCKING_STATUSES.has(updated.status)) {
    const availability = checkAvailability(updated, { excludeAppointmentId: updated.id });
    if (!availability.available) {
      throw new AppointmentStorageError('BARBER_UNAVAILABLE', 'That barber already has an appointment during this time.');
    }
  }

  appointments[currentIndex] = updated;
  writeAppointments(appointments);
  return updated;
}

export function deleteAppointment(appointmentId) {
  const appointments = readAppointments();
  const remainingAppointments = appointments.filter((appointment) => appointment.id !== appointmentId);
  if (remainingAppointments.length === appointments.length) return false;

  writeAppointments(remainingAppointments);
  return true;
}

export function subscribeToAppointmentChanges(listener) {
  if (typeof window === 'undefined') return () => {};

  const handleChange = () => listener(getAppointments());
  const handleStorageChange = (event) => {
    if (event.key === APPOINTMENTS_STORAGE_KEY || event.key === null) handleChange();
  };

  window.addEventListener(APPOINTMENTS_CHANGED_EVENT, handleChange);
  window.addEventListener('storage', handleStorageChange);

  return () => {
    window.removeEventListener(APPOINTMENTS_CHANGED_EVENT, handleChange);
    window.removeEventListener('storage', handleStorageChange);
  };
}
