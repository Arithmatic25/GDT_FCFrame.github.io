const insertSlideButton = document.getElementById('insert-slide');

window.Office?.onReady(({ host }) => {
  if (host !== Office.HostType.PowerPoint) return;

  insertSlideButton.hidden = false;
  insertSlideButton.addEventListener('click', async () => {
    insertSlideButton.disabled = true;
    try {
      const frame = buildFrameSvg();
      const image = await svgToPngBlob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(image);
      });
      const scale = Math.min(1, 300 / frame.width, 180 / frame.height);

      await new Promise((resolve, reject) => {
        Office.context.document.setSelectedDataAsync(dataUrl.split(',')[1], {
          coercionType: Office.CoercionType.Image,
          imageWidth: Math.round(frame.width * scale),
          imageHeight: Math.round(frame.height * scale)
        }, (result) => {
          if (result.status === Office.AsyncResultStatus.Succeeded) resolve();
          else reject(new Error(result.error.message));
        });
      });
      showToast('Frame inserted into the slide.');
    } catch (error) {
      showToast(error.message || 'PowerPoint could not insert the frame.', true);
    } finally {
      insertSlideButton.disabled = false;
    }
  });
});
