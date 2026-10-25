// =========================================================
// BERTH NUMBERS
//
// Used by Berth Management and by the Port Dashboard, so both pages
// always show the same berth numbers and the same count of available
// (vacant) berths.
//
// There is no berth database behind these numbers. Each ship at berth
// is given a berth number made from its MMSI: the same ship gets the
// same number every time and two ships never share a number. A berth
// number is available (vacant) when no ship at berth has it.
// =========================================================

// Number of berths the generated berth numbers are spread over
// (B-01 ... B-120). This is also the total used to work out the
// available berths: change this one number if the port has more or
// fewer berths. It changes both pages.
export const BERTH_POOL = 120;

const hashText = (text) => {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);

    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

export const berthLabel = (slot) => `B-${String(slot + 1).padStart(2, "0")}`;

// Gives every ship in the list a berth number.
// A ship is an object with a `key` (its id) and an `mmsi`.
// Returns a Map of ship.key -> { label, slot }.
export const assignBerths = (ships) => {
  const taken = new Set();

  const assigned = new Map();

  [...ships]
    .sort((a, b) =>
      (a.mmsi || String(a.key)).localeCompare(b.mmsi || String(b.key))
    )
    .forEach((ship) => {
      let slot = hashText(ship.mmsi || String(ship.key)) % BERTH_POOL;

      let tries = 0;

      while (taken.has(slot) && tries < BERTH_POOL) {
        slot = (slot + 1) % BERTH_POOL;

        tries += 1;
      }

      // Only reached when more ships than berths are at berth.
      while (taken.has(slot)) slot += 1;

      taken.add(slot);

      assigned.set(ship.key, { label: berthLabel(slot), slot });
    });

  return assigned;
};

// Takes the slots (0, 1, 2 ...) used by the ships at berth.
// Returns the berth numbers of the pool, in order, that are vacant.
export const listAvailableBerths = (usedSlots) => {
  const taken = new Set(usedSlots);

  const free = [];

  for (let slot = 0; slot < BERTH_POOL; slot += 1) {
    if (!taken.has(slot)) {
      free.push({ slot, label: berthLabel(slot) });
    }
  }

  return free;
};