try {
  if (typeof Container !== 'undefined') window.LiquidGlassContainer = Container;
  if (typeof Button !== 'undefined') window.LiquidGlassButton = Button;
} catch (error) {
  console.warn('Liquid Glass expose failed', error);
}
