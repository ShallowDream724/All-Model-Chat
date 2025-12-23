
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { CodeBlock } from './blocks/CodeBlock';
import { MermaidBlock } from './blocks/MermaidBlock';
import { GraphvizBlock } from './blocks/GraphvizBlock';
import { TableBlock } from './blocks/TableBlock';
import { ToolResultBlock } from './blocks/ToolResultBlock';
import { UploadedFile, SideViewContent } from '../../types';
import { translations } from '../../utils/appUtils';
import { extractTextFromNode } from '../../utils/uiUtils';
import { getRehypePlugins, remarkPlugins } from '../../utils/markdownConfig';
import { InlineCode } from './code-block/InlineCode';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';

interface MarkdownRendererProps {
  content: string;
  isLoading: boolean;
  onImageClick: (file: UploadedFile) => void;
  onOpenHtmlPreview: (html: string, options?: { initialTrueFullscreen?: boolean }) => void;
  expandCodeBlocksByDefault: boolean;
  isMermaidRenderingEnabled: boolean;
  isGraphvizRenderingEnabled: boolean;
  allowHtml?: boolean;
  t: (key: keyof typeof translations) => string;
  themeId: string;
  onOpenSidePanel: (content: SideViewContent) => void;
}

const extractTexFromReactTree = (node: React.ReactNode): string | null => {
  if (!node) return null;
  if (typeof node === 'string' || typeof node === 'number') return null;

  if (Array.isArray(node)) {
    for (const child of node) {
      const tex = extractTexFromReactTree(child);
      if (tex !== null) return tex;
    }
    return null;
  }

  if (!React.isValidElement(node)) return null;

  const el = node as React.ReactElement<any>;

  if (
    typeof el.type === 'string' &&
    el.type.toLowerCase() === 'annotation' &&
    typeof el.props?.encoding === 'string' &&
    el.props.encoding.toLowerCase().startsWith('application/x-tex')
  ) {
    const text = extractTextFromNode(el.props.children).trim();
    return text || null;
  }

  return extractTexFromReactTree(el.props.children);
};

const MathHoverSpan: React.FC<any & { latex?: string; isDisplay?: boolean }> = ({
  latex,
  isDisplay,
  children,
  className,
  ...props
}) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard(1500);

  const handleCopyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!latex) return;

    const normalized = latex.trim();
    const wrapped = isDisplay ? `$$\n${normalized}\n$$` : `$${normalized}$`;
    copyToClipboard(wrapped);
  };

  return (
    <span
      {...props}
      className={`${className || ''} amc-math-hover`}
      onClick={isDisplay ? undefined : handleCopyClick}
      onClickCapture={isDisplay ? handleCopyClick : undefined}
      title={latex ? 'Click to copy LaTeX' : undefined}
    >
      {children}
      {isCopied && <span className="amc-math-copied-tooltip">Copied!</span>}
    </span>
  );
};
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(({
  content,
  isLoading,
  onImageClick,
  onOpenHtmlPreview,
  expandCodeBlocksByDefault,
  isMermaidRenderingEnabled,
  isGraphvizRenderingEnabled,
  allowHtml = false,
  t,
  themeId,
  onOpenSidePanel,
}) => {

  const rehypePlugins = useMemo(() => getRehypePlugins(allowHtml), [allowHtml]);

  const components = useMemo(() => ({
    code: (props: any) => {
        return <InlineCode {...props} />;
    },
    span: (props: any) => {
      const className: string = props.className || '';

      const isDisplayRoot = className.includes('katex-display');
      const isInlineRoot =
        className.includes('katex') &&
        !className.includes('katex-display') &&
        !className.includes('katex-mathml') &&
        !className.includes('katex-html');

      if (isDisplayRoot || isInlineRoot) {
        const latex = extractTexFromReactTree(props.children) || undefined;
        return <MathHoverSpan {...props} latex={latex} isDisplay={isDisplayRoot} />;
      }

      return <span {...props} />;
    },
    table: (props: any) => <TableBlock {...props} />,
    a: (props: any) => {
        const { href, children, ...rest } = props;
        const isInternal = href && (href.startsWith('#') || href.startsWith('/'));
        
        return (
            <a 
                href={href} 
                target={isInternal ? undefined : '_blank'} 
                rel={isInternal ? undefined : 'noopener noreferrer'} 
                {...rest}
            >
                {children}
            </a>
        );
    },
    div: (props: any) => {
      const { className, children, ...rest } = props;
      if (className?.includes('tool-result')) {
        return <ToolResultBlock className={className} {...rest}>{children}</ToolResultBlock>;
      }
      return <div className={className} {...rest}>{children}</div>;
    },
    pre: (props: any) => {
      const { node, children, ...rest } = props;
      
      const codeElement = React.Children.toArray(children).find(
        (child: any) => {
            return React.isValidElement(child) && (
                child.type === 'code' || 
                (child.props as any).className?.includes('language-') ||
                true 
            );
        }
      ) as React.ReactElement | undefined;

      // Safe property access with optional chaining and type casting
      const codeClassName = (codeElement?.props as any)?.className || '';
      const codeContent = (codeElement?.props as any)?.children;
      
      // Extract text reliably from potential React Element tree (from highlighting)
      const rawCode = extractTextFromNode(codeContent);
      
      const langMatch = codeClassName.match(/language-(\S+)/);
      const language = langMatch ? langMatch[1] : '';
      const isGraphviz = language === 'graphviz' || language === 'dot';

      if (isMermaidRenderingEnabled && language === 'mermaid' && typeof rawCode === 'string') {
        return (
          <div>
            <MermaidBlock code={rawCode} onImageClick={onImageClick} isLoading={isLoading} themeId={themeId} onOpenSidePanel={onOpenSidePanel} />
          </div>
        );
      }

      if (isGraphvizRenderingEnabled && isGraphviz && typeof rawCode === 'string') {
        return (
          <div>
            <GraphvizBlock code={rawCode} onImageClick={onImageClick} isLoading={isLoading} themeId={themeId} onOpenSidePanel={onOpenSidePanel} />
          </div>
        );
      }
      
      return (
        <CodeBlock 
          {...rest} 
          className={codeClassName} 
          onOpenHtmlPreview={onOpenHtmlPreview} 
          expandCodeBlocksByDefault={expandCodeBlocksByDefault}
          t={t}
          onOpenSidePanel={onOpenSidePanel}
        >
          {codeElement || children}
        </CodeBlock>
      );
    }
  }), [onOpenHtmlPreview, expandCodeBlocksByDefault, onImageClick, isMermaidRenderingEnabled, isGraphvizRenderingEnabled, isLoading, t, themeId, onOpenSidePanel]);

  const processedContent = useMemo(() => {
    if (!content) return '';
    // Split by code blocks to avoid replacing content inside them
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map(part => {
      if (part.startsWith('```')) {
        return part;
      }
      let processedPart = part.replace(/((:|：)\*\*)(\S)/g, '$1 $3');
      
      // Replace \[ ... \] with $$ ... $$
      processedPart = processedPart.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');
      
      // Replace \( ... \) with $ ... $
      processedPart = processedPart.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
      
      return processedPart;
    }).join('');
  }, [content]);

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins as any}
      rehypePlugins={rehypePlugins as any}
      components={components}
    >
      {processedContent}
    </ReactMarkdown>
  );
});
