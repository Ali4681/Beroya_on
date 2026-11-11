declare module "react-pageflip" {
  import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from "react";

  type HTMLFlipBookProps = {
    children?: ReactNode;
    width: number;
    height: number;
    size?: "fixed" | "stretch";
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    drawShadow?: boolean;
    flippingTime?: number;
    usePortrait?: boolean;
    startZIndex?: number;
    autoSize?: boolean;
    maxShadowOpacity?: number;
    showCover?: boolean;
    showPageCorners?: boolean;
    disableFlipByClick?: boolean;
    mobileScrollSupport?: boolean;
    swipeDistance?: number;
    clickEventForward?: boolean;
    useMouseEvents?: boolean;
    renderOnlyPageLengthChange?: boolean;
    className?: string;
    style?: React.CSSProperties;
    startPage?: number;
    onFlip?: (event: { data: number }) => void;
    onChangeOrientation?: (event: { data: string }) => void;
    onChangeState?: (event: { data: string }) => void;
    onInit?: (event: { data: { page: number; mode: string } }) => void;
    onUpdate?: (event: { data: { page: number; mode: string } }) => void;
  };

  type HTMLFlipBookRef = {
    pageFlip: () => {
      flipNext: (corner?: string) => void;
      flipPrev: (corner?: string) => void;
      getCurrentPageIndex: () => number;
      getPageCount: () => number;
      turnToPage: (page: number) => void;
    };
  };

  const HTMLFlipBook: ForwardRefExoticComponent<
    PropsWithoutRef<HTMLFlipBookProps> & RefAttributes<HTMLFlipBookRef>
  >;

  export default HTMLFlipBook;
}
