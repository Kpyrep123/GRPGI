/* Runs after grant/stat modules so the preview uses the final character rules. */
(() => {
  if (window.GRPGRegistrationBridgeV179)
    window.GRPGRegistrationLoadoutV179.install(
      window.GRPGRegistrationBridgeV179,
    );
})();
