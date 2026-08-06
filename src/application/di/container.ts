import { getServiceProvider, registerServices } from './registerServices';
import { TOKENS } from './tokens';

const services = getServiceProvider();

/** @deprecated Use services.resolve(TOKENS.platformContext) — kept for backward compatibility. */
export const platform = services.resolve(TOKENS.platformContext);

/** @deprecated Use services.resolve(TOKENS.channelIndex) — kept for backward compatibility. */
export const channelIndex = services.resolve(TOKENS.channelIndex);

/** @deprecated Use services.resolve(TOKENS.repositories) — kept for backward compatibility. */
export const repositories = services.resolve(TOKENS.repositories);

export { services, TOKENS, registerServices, getServiceProvider };
