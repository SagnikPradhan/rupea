/**
 * Outgoing email. Only `logMailer` exists for now: it writes the message to
 * the server log, which is enough for development and a self-hosted setup.
 */
import { withLogger } from './logger';
import { okAsync, type ResultAsync } from './result';

export type Mail = { to: string; subject: string; text: string };

export interface Mailer {
	send(mail: Mail): ResultAsync<void>;
}

export const logMailer: Mailer = {
	send: (mail) =>
		withLogger('mailer')((logger) => {
			logger.info({ mail }, 'mail sent');
			return okAsync();
		}),
};
