/**
 * Navigate back safely. If there is no history to go back to,
 * fall back to the provided route.
 */
export function navigateBack(navigate, fallback = '/marketplace') {
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate(fallback, { replace: true });
  }
}
