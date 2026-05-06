import { test, expect } from '@playwright/test'

test('landing page renders brand identity', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Olivia')).toBeVisible()
  await expect(page.getByText('Stunning product ads')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible()
})

test('sign-in link navigates to auth page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/sign-in/)
})

test('/app redirects unauthenticated users to sign-in', async ({ page }) => {
  await page.goto('/app')
  await expect(page).toHaveURL(/sign-in/)
})
