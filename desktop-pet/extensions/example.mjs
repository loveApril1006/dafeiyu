// Run explicitly to demonstrate controlling the installed pet. No QQ action is performed.
import { PetClient } from '../pet-client.mjs';
const pet = new PetClient();
await pet.say('新功能来报到啦，今天也请多指教。');
