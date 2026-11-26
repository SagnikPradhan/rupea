import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

export const GET = ({ params, url }) =>
	redirect(
		308,
		resolve('/(signed-in)/l/[handle]/net-worth', { handle: params.handle }) + url.search,
	);
