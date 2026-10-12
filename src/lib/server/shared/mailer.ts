import { withLogger } from './logger';
import { okAsync, type ResultAsync } from './result/result';

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
