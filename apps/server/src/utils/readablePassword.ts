import { createHash, createHmac } from 'crypto'

/**
 * Readable, deterministic passwords that nobody outside the server can work
 * out -- e.g. "Brave-Tiger-482".
 *
 * Staff relay first passwords by hand, so they must survive being read aloud
 * over a desk and be reproducible (the import preview shows the password the
 * commit will set). The previous scheme met both by deriving the password
 * from the student ID -- but student IDs are effectively public (ID cards,
 * class lists, and until migration 073 the database itself), and the formula
 * sat in this public repository, so anyone could sign in as any athlete who
 * hadn't changed it yet.
 *
 * This keeps readable and deterministic, and adds a secret: the words come
 * from an HMAC keyed by a server-only value, so the same label always yields
 * the same password on the server, and nothing else can compute it.
 *
 *   adjective x noun x 3-digit number = 256 x 256 x 900 ≈ 59 million options
 *
 * The lists avoid sound-alike words (bear/bare, sea/see), silent or tricky
 * spellings, and anything that reads badly in any combination.
 */

// prettier-ignore
const ADJECTIVES = [
  'able', 'agile', 'alert', 'amber', 'ample', 'azure', 'balmy', 'bold',
  'brave', 'bright', 'brisk', 'broad', 'bronze', 'bubbly', 'calm', 'candid',
  'caring', 'casual', 'cheery', 'chief', 'civic', 'classic', 'clean', 'clear',
  'clever', 'cobalt', 'comfy', 'cool', 'cosmic', 'cozy', 'crafty', 'crimson',
  'crisp', 'curious', 'daily', 'dandy', 'daring', 'deep', 'dreamy', 'driven',
  'dynamic', 'eager', 'early', 'easy', 'elegant', 'emerald', 'endless', 'epic',
  'even', 'exact', 'expert', 'fabled', 'famous', 'fancy', 'fast', 'festive',
  'fiery', 'fine', 'firm', 'first', 'fit', 'flashy', 'fleet', 'fluent',
  'flying', 'focused', 'fond', 'formal', 'fresh', 'frosty', 'funny', 'gentle',
  'giant', 'gifted', 'glad', 'global', 'glossy', 'glowing', 'golden', 'good',
  'grand', 'green', 'happy', 'hardy', 'hearty', 'helpful', 'heroic', 'hidden',
  'honest', 'hopeful', 'humble', 'icy', 'ideal', 'indigo', 'ivory', 'jade',
  'jaunty', 'jazzy', 'jolly', 'joyful', 'jumbo', 'keen', 'kind', 'kindly',
  'large', 'leafy', 'level', 'light', 'lilac', 'lime', 'lively', 'local',
  'lofty', 'logical', 'loyal', 'lucky', 'lunar', 'misty', 'magic', 'nifty',
  'major', 'mellow', 'merry', 'mighty', 'mild', 'mint', 'modern', 'modest',
  'musical', 'mystic', 'neat', 'nimble', 'noble', 'novel', 'olive', 'open',
  'orange', 'pastel', 'patient', 'perfect', 'plucky', 'polar', 'polite', 'popular',
  'precise', 'prime', 'proud', 'pure', 'purple', 'quick', 'quiet', 'radiant',
  'rapid', 'rare', 'ready', 'regal', 'relaxed', 'rich', 'rising', 'robust',
  'rocky', 'rosy', 'royal', 'ruby', 'rugged', 'rustic', 'sandy', 'savvy',
  'scarlet', 'secret', 'serene', 'sharp', 'shiny', 'silent', 'silky', 'silver',
  'simple', 'sincere', 'sleek', 'smart', 'smooth', 'snowy', 'social', 'soft',
  'solar', 'solid', 'sonic', 'speedy', 'snappy', 'spry', 'stable', 'starry',
  'steady', 'stellar', 'stormy', 'strong', 'sturdy', 'stylish', 'sunny', 'super',
  'peppy', 'swift', 'tall', 'teal', 'tender', 'thrifty', 'tidy', 'timely',
  'tiny', 'topaz', 'trendy', 'true', 'trusty', 'turbo', 'twin', 'ultra',
  'upbeat', 'urban', 'useful', 'valiant', 'velvet', 'vibrant', 'violet', 'vital',
  'vivid', 'warm', 'wavy', 'wide', 'wild', 'windy', 'wise', 'witty',
  'wooden', 'worthy', 'young', 'zany', 'zesty', 'zippy', 'active', 'artful',
  'breezy', 'cheerful', 'dapper', 'fearless', 'gallant', 'lasting', 'sparkly', 'grassy',
  'sunlit', 'playful', 'mindful', 'sporty', 'bouncy', 'fluffy', 'tropical', 'vintage',
]

// prettier-ignore
const NOUNS = [
  'badger', 'hedgehog', 'bison', 'bobcat', 'ribbon', 'cobra', 'umbrella', 'crane',
  'dolphin', 'eagle', 'falcon', 'finch', 'fox', 'gazelle', 'gecko', 'hamster',
  'hawk', 'heron', 'hippo', 'kiwi', 'koala', 'lemur', 'lion', 'mantis',
  'marlin', 'meerkat', 'orca', 'osprey', 'otter', 'owl', 'panda', 'panther',
  'parrot', 'pelican', 'penguin', 'pony', 'puffin', 'rabbit', 'raven', 'robin',
  'shark', 'kayak', 'sparrow', 'squid', 'swan', 'tiger', 'toucan', 'turtle',
  'walrus', 'wombat', 'zebra', 'beetle', 'cricket', 'dragon', 'condor', 'unicorn',
  'lobster', 'octopus', 'oyster', 'trout', 'magpie', 'goose', 'lark', 'puppy',
  'alpaca', 'beagle', 'collie', 'acorn', 'aurora', 'bamboo', 'blossom', 'flamingo',
  'breeze', 'brook', 'canyon', 'cavern', 'cedar', 'cliff', 'clover', 'cloud',
  'comet', 'coast', 'cove', 'crater', 'ladybug', 'crystal', 'daisy', 'delta',
  'dune', 'ember', 'fern', 'field', 'flame', 'forest', 'fossil', 'galaxy',
  'garden', 'glacier', 'glade', 'grove', 'hill', 'horizon', 'jungle', 'lagoon',
  'lake', 'lava', 'leaf', 'lotus', 'maple', 'marsh', 'meadow', 'mesa',
  'meteor', 'moon', 'moss', 'nebula', 'oasis', 'ocean', 'orchid', 'palm',
  'pebble', 'firefly', 'pine', 'planet', 'pond', 'quartz', 'rainbow', 'reef',
  'ridge', 'river', 'sapling', 'shore', 'sky', 'snow', 'spring', 'spruce',
  'star', 'stone', 'storm', 'stream', 'summit', 'sunrise', 'thunder', 'timber',
  'tulip', 'tundra', 'valley', 'volcano', 'seahorse', 'willow', 'anchor', 'anvil',
  'arrow', 'atlas', 'badge', 'banner', 'basket', 'beacon', 'bridge', 'bucket',
  'button', 'cabin', 'camera', 'candle', 'canoe', 'starfish', 'castle', 'compass',
  'copper', 'crayon', 'crown', 'drum', 'engine', 'feather', 'flag', 'flute',
  'gadget', 'glider', 'globe', 'guitar', 'hammer', 'harp', 'helmet', 'jacket',
  'parakeet', 'kettle', 'kite', 'ladder', 'lantern', 'laptop', 'locket', 'magnet',
  'marble', 'bicycle', 'mirror', 'mitten', 'motor', 'orbit', 'paddle', 'paper',
  'parade', 'pencil', 'piano', 'pillow', 'pilot', 'pixel', 'pocket', 'prism',
  'puzzle', 'quill', 'radar', 'radio', 'rocket', 'saddle', 'scooter', 'shield',
  'signal', 'sketch', 'sled', 'spark', 'sphere', 'spiral', 'spoon', 'statue',
  'tablet', 'teapot', 'tent', 'ticket', 'torch', 'tower', 'tractor', 'trophy',
  'trumpet', 'tunnel', 'violin', 'wagon', 'whistle', 'window', 'wizard', 'zipper',
  'apple', 'bagel', 'butter', 'cherry', 'cocoa', 'coconut', 'cookie', 'blanket',
  'lemon', 'mango', 'backpack', 'muffin', 'pancake', 'papaya', 'peanut', 'pepper',
]

function assertWordList(name: string, list: readonly string[]): void {
  const unique = new Set(list)
  if (list.length !== 256 || unique.size !== 256) {
    throw new Error(
      `${name} must hold exactly 256 unique words (has ${list.length}, ${unique.size} unique)`,
    )
  }
  const bad = list.find((w) => !/^[a-z]{3,8}$/.test(w))
  if (bad) throw new Error(`${name}: "${bad}" must be 3-8 lowercase letters`)
}
assertWordList('ADJECTIVES', ADJECTIVES)
assertWordList('NOUNS', NOUNS)
const overlap = ADJECTIVES.find((w) => NOUNS.includes(w))
if (overlap) throw new Error(`"${overlap}" appears in both word lists`)

let cachedKey: Buffer | null = null

/**
 * ACCOUNT_PASSWORD_SECRET if set, else derived from the service-role key --
 * a high-entropy value the server already holds and never sends to a client,
 * so this works on deploy with no new configuration. Anyone holding the
 * service-role key already controls every account outright, so deriving from
 * it adds no exposure. Set ACCOUNT_PASSWORD_SECRET before rotating that key
 * if already-issued passwords should stay reproducible.
 */
function passwordKey(): Buffer {
  if (cachedKey) return cachedKey
  const secret =
    process.env.ACCOUNT_PASSWORD_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!secret) {
    throw new Error(
      'Cannot generate account passwords: set ACCOUNT_PASSWORD_SECRET or SUPABASE_SERVICE_ROLE_KEY on the server.',
    )
  }
  cachedKey = createHash('sha256').update('u-sports/account-passwords/v1\0').update(secret).digest()
  return cachedKey
}

const capitalize = (w: string) => w[0].toUpperCase() + w.slice(1)

/** Same label -> same password, on this server only. */
export function readablePassword(label: string): string {
  const digest = createHmac('sha256', passwordKey()).update(label).digest()
  const number = 100 + (digest.readUInt16BE(2) % 900)
  return `${capitalize(ADJECTIVES[digest[0]])}-${capitalize(NOUNS[digest[1]])}-${number}`
}

/** An athlete's first password, reproducible from their student ID. */
export function firstPassword(studentId: string): string {
  return readablePassword(`first:${studentId.replace(/\s+/g, '').toLowerCase()}`)
}

/**
 * A staff-issued reset. `sequence` is how many resets this account has had,
 * so every reset yields a new password while any one of them stays
 * reproducible.
 */
export function resetPassword(accountKey: string, sequence: number): string {
  return readablePassword(`reset:${accountKey}:${sequence}`)
}

/**
 * Written to profiles.issued_password_scheme whenever the server sets a
 * password from this module, so a reissue can tell accounts still on an old
 * guessable password from ones already on this scheme. NULL means the
 * password predates it.
 */
export const ISSUED_PASSWORD_SCHEME = 'keyed-v1'
