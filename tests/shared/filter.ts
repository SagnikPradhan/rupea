import { fireEvent, screen } from '@testing-library/svelte';

/** Opens a page's filter panel the way a person would, so the pickers inside it render. */
export const openFilter = async () => {
	await fireEvent.click(await screen.findByRole('button', { name: 'Filter' }));
	return screen.findByRole('dialog', { name: 'Filter' });
};
