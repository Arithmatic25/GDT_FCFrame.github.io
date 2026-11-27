const insertSlideButton = document.getElementById('insert-slide');

async function snapshotSlideShapes() {
  return PowerPoint.run(async (context) => {
    const slide = context.presentation.getSelectedSlides().getItemAt(0);
    slide.load('id');
    slide.shapes.load('items/id');
    await context.sync();
    return {
      slideId: slide.id,
      shapeIds: new Set(slide.shapes.items.map((shape) => shape.id))
    };
  });
}

async function selectInsertedPicture(before) {
  return PowerPoint.run(async (context) => {
    const slide = context.presentation.getSelectedSlides().getItemAt(0);
    slide.load('id');
    slide.shapes.load('items/id,items/type');
    await context.sync();
    if (slide.id !== before.slideId) return false;

    const newPictures = slide.shapes.items.filter((shape) =>
      shape.type === PowerPoint.ShapeType.image && !before.shapeIds.has(shape.id)
    );
    if (newPictures.length !== 1) return false;

    slide.setSelectedShapes([newPictures[0].id]);
    await context.sync();
    return true;
  });
}

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
      const canSelectPicture = window.PowerPoint &&
        Office.context.requirements?.isSetSupported('PowerPointApi', '1.5');
      const before = canSelectPicture ? await snapshotSlideShapes().catch(() => null) : null;

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
      const selected = before && await selectInsertedPicture(before).catch(() => false);
      showToast(selected ? 'Frame inserted into the slide.' : 'Frame inserted. Click the picture on the slide to resize it.');
    } catch (error) {
      showToast(error.message || 'PowerPoint could not insert the frame.', true);
    } finally {
      insertSlideButton.disabled = false;
    }
  });
});
