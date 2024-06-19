
function updateSymbolOutput() {
    var select = document.getElementById("symbol");
    var textarea = document.getElementById("featureControlFrame");
    var selectedValue = select.value;
    textarea.value = selectedValue; // Assuming the selected value matches the symbol character in the custom font

}

document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('.grid button');
    const textarea = document.getElementById('featureControlFrame');
    const clearButton = document.getElementById('clear');
    //const copyFcfButton = document.getElementById('copyFcf');
    const copyPngImgButton = document.getElementById('copyPngImg');

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            textarea.value += button.textContent;
        });
    });

    clearButton.addEventListener('click', () => {
        textarea.value = '';
    });



    copyPngImgButton.addEventListener('click', () => {
        // Create a temporary element to hold the text content
        const tempElement = document.createElement('div');
        tempElement.style.position = 'absolute';
        //tempElement.style.whiteSpace = 'pre-wrap'; // Preserve whitespace
        tempElement.style.fontFamily = 'MyCustomFont'; // Use the same font as the textarea
        tempElement.style.fontSize = 'inherit'; // Use the same font size as the textarea
        tempElement.style.lineHeight = '1.20'; // Use the same line height as the textarea
        tempElement.style.padding = '0';
        tempElement.style.margin = '0';
        tempElement.style.border = 'none';
        tempElement.style.color = textarea.style.color;
        //tempElement.style.visibility = 'hidden';
        tempElement.textContent = textarea.value;

        document.body.appendChild(tempElement);

        html2canvas(tempElement, { scale: 5 }).then(canvas => {  // Increase the scale factor to 4
            canvas.toBlob(blob => {
                const item = new ClipboardItem({ "image/png": blob });
                navigator.clipboard.write([item]).then(() => {
                    alert('PNG image copied to clipboard!');
                }).catch(err => {
                    console.error('Could not copy image:', err);
                });
            });

            document.body.removeChild(tempElement); // Remove the temporary element after capturing
        });
    });
});
let isInputHandling = false;

document.getElementById('changeColorButton').addEventListener('click', function() {
    var textarea = document.getElementById('featureControlFrame');
    var currentColor = textarea.style.color;
    
    // Determine the new color based on the current color
    var newColor;
    switch (currentColor) {
        case 'red':
            newColor = 'blue';
            break;
        case 'blue':
            newColor = 'black';
            break;
        default:
            newColor = 'red';
            break;
    }
    
    textarea.style.color = newColor;
});

